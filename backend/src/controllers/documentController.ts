import fs from 'fs/promises';
import path from 'path';
import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { FolderModel } from '../models/Folder';
import { User } from '../models/User';
import { DownloadRecord } from '../models/DownloadRecord';
import { DownloadCode } from '../models/DownloadCode';
import { AccessRequest } from '../models/AccessRequest';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { sha256File } from '../utils/hash';
import { env } from '../config/env';
import * as blockchainService from '../services/blockchainService';
import { logActivity, clientMeta } from '../services/activityService';
import { notifyDocumentDeleted } from '../services/notificationService';
import { storageProvider } from '../services/storageService';
import { setEncryptedFileHeaders } from '../utils/encryptionHeaders';
import {
  getOrCreateDownloadCode,
  regenerateDownloadCode,
} from '../services/downloadCodeService';

const buildSearchFilter = (search: string | undefined) => {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $or: [{ originalName: rx }, { sha256Hash: rx }, { transactionHash: rx }, { tags: rx }],
  };
};

const parseTagFilter = (tag: string | string[] | undefined): string[] | undefined => {
  if (!tag) return undefined;
  const raw = Array.isArray(tag) ? tag : [tag];
  const tags = raw
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 24);
  return tags.length > 0 ? tags : undefined;
};

/**
 * The contract records `owner = msg.sender`, so the on-chain owner of a
 * registration is only meaningful if it is the wallet linked to this account.
 * Registration therefore requires a linked wallet, and the transaction must
 * have been sent by that exact wallet.
 */
const assertRegistrationWallet = async (
  userId: string,
  signer: string | undefined
): Promise<void> => {
  const user = await User.findById(userId).select('walletAddress');
  if (!user) throw ApiError.notFound('User not found');
  if (!user.walletAddress) {
    throw ApiError.badRequest(
      'Link your wallet to your account before registering on the blockchain. Open Profile -> Blockchain Identity and link it.'
    );
  }
  if (!signer || signer.toLowerCase() !== user.walletAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `This transaction was sent by ${
        signer ?? 'an unknown wallet'
      }, which is not the wallet linked to your account (${user.walletAddress}). Connect the linked wallet and try again.`
    );
  }
};

/**
 * Create a document record. Two modes:
 *  - Registered: the wallet has already stored the file's hash on-chain, so the
 *    submitted transactionHash is independently verified server-side.
 *  - Pending: no transactionHash is supplied; the document is saved as PENDING
 *    and can be registered on-chain later via POST /api/documents/:id/register.
 *
 * When `parentId` is provided the new document is recorded as the next revision
 * of an existing (on-chain confirmed) document, keeping the full version chain.
 */
export const createDocument = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Document file is required');

  const {
    originalName,
    fileSize,
    mimeType,
    sha256Hash,
    transactionHash,
    blockNumber,
    parentId,
    folderId,
    tags,
    encrypted,
    encryptionIv,
    encryptionWrappedKey,
    encryptionKeyIv,
    ciphertextHash,
    ciphertextSize,
  } = req.body as {
    originalName: string;
    fileSize: number;
    mimeType: string;
    sha256Hash: string;
    transactionHash?: string;
    blockNumber?: number;
    parentId?: string;
    folderId?: string;
    tags?: string[];
    encrypted: boolean;
    encryptionIv?: string;
    encryptionWrappedKey?: string;
    encryptionKeyIv?: string;
    ciphertextHash?: string;
    ciphertextSize?: number;
  };

  // 1. The bytes on disk are either the plaintext (legacy) or ciphertext
  // (client-side encrypted). Validate whichever contract applies.
  const computedHash = await sha256File(file.path);
  const plaintextHash = sha256Hash.toLowerCase();

  if (encrypted) {
    if (
      !encryptionIv ||
      !encryptionWrappedKey ||
      !encryptionKeyIv ||
      !ciphertextHash ||
      !ciphertextSize
    ) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest('Encrypted upload metadata is incomplete.');
    }
    if (computedHash !== ciphertextHash.toLowerCase()) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest('The uploaded encrypted file failed its integrity check.');
    }
    if (file.size !== Number(ciphertextSize)) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest('Encrypted file size mismatch.');
    }
  } else {
    if (computedHash !== plaintextHash) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest(
        'The uploaded file does not match the hash registered on the blockchain.'
      );
    }
    if (file.size !== Number(fileSize)) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest('File size mismatch.');
    }
  }

  let validatedTx = undefined;
  // 2. When a transaction is supplied it must genuinely exist and register
  // the plaintext hash (the hash anchored on-chain).
  if (transactionHash) {
    const validation = await blockchainService.validateRegistrationTx(transactionHash, plaintextHash);
    if (!validation.valid || !validation.details) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest(
        validation.reason ?? 'Blockchain transaction could not be verified.'
      );
    }
    validatedTx = validation.details;
    // The wallet that sent the transaction must be the wallet linked to the account.
    try {
      await assertRegistrationWallet(String(req.user!.id), validatedTx.from);
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  // 3. Optional new-version linkage: verify the parent exists, belongs to this
  // user, and is already confirmed on-chain before a newer revision can exist.
  let family: { familyId?: string; version: number; previousVersionId?: string; previousVersionHash?: string } = {
    version: 1,
  };
  if (parentId) {
    const parent = await DocumentModel.findById(parentId);
    if (!parent) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.notFound('The document being revised was not found');
    }
    const isParentOwner = String(parent.userId) === String(req.user!.id);
    if (!isParentOwner && req.user!.role !== 'ADMIN') {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.forbidden('You do not have access to this document');
    }
    if (parent.blockchainStatus !== 'CONFIRMED') {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest(
        'Register the current version on the blockchain before uploading a new revision.'
      );
    }
    family = {
      familyId: String(parent.familyId ?? parent._id),
      version: (parent.version ?? 1) + 1,
      previousVersionId: String(parent._id),
      previousVersionHash: parent.sha256Hash,
    };
  }

    // 4. Validate folder ownership and normalise tags.
  let resolvedFolderId: string | null = null;
  if (folderId) {
    const folder = await FolderModel.findOne({ _id: folderId, userId: req.user!.id });
    if (!folder) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest('The specified folder does not exist or does not belong to you');
    }
    resolvedFolderId = String(folder._id);
  }
  const normalisedTags = Array.from(new Set((tags ?? []).map((t) => t.trim().toLowerCase()))).filter(Boolean);

  const document = await DocumentModel.create({
    userId: req.user!.id,
    originalName,
    fileName: path.basename(file.filename),
    fileSize: encrypted ? Number(fileSize) : file.size,
    mimeType,
    storagePath: file.filename,
    sha256Hash: plaintextHash,
    encryption: encrypted
      ? {
          version: 1,
          algorithm: 'AES-256-GCM',
          iv: encryptionIv!,
          wrappedKey: encryptionWrappedKey!,
          keyIv: encryptionKeyIv!,
          plaintextHash,
          ciphertextHash: computedHash,
          ciphertextSize: file.size,
        }
      : undefined,
    blockchainHash: validatedTx ? plaintextHash : undefined,
    transactionHash: validatedTx ? transactionHash : undefined,
    blockNumber: validatedTx ? (validatedTx.blockNumber ?? blockNumber) : undefined,
    contractAddress: validatedTx ? env.blockchain.contractAddress.toLowerCase() : undefined,
    chainId: validatedTx ? env.blockchain.chainId : undefined,
    uploadedAt: new Date(),
    blockchainStatus: validatedTx ? 'CONFIRMED' : 'PENDING',
    verificationStatus: validatedTx ? 'VERIFIED' : 'UNVERIFIED',
    familyId: family.familyId,
    version: family.version > 1 ? family.version : undefined,
    previousVersionId: family.previousVersionId,
    previousVersionHash: family.previousVersionHash,
    folderId: resolvedFolderId,
    tags: normalisedTags.length > 0 ? normalisedTags : undefined,
  }).catch(async (err: Error) => {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  });

  await logActivity({
    userId: String(req.user!.id),
    action: family.previousVersionId ? 'DOCUMENT_NEW_VERSION' : 'DOCUMENT_UPLOAD',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: {
      name: originalName,
      hash: plaintextHash,
      transactionHash,
      encrypted,
      version: family.version,
      previousVersionId: family.previousVersionId,
    },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });
  if (validatedTx) {
    await logActivity({
      userId: String(req.user!.id),
      action: 'BLOCKCHAIN_REGISTER',
      entityType: 'DOCUMENT',
      entityId: String(document._id),
      metadata: { transactionHash, blockNumber: document.blockNumber },
      ...clientMeta(req.ip, req.headers['user-agent']),
    });
  }

  res.status(201).json({
    success: true,
    message: validatedTx
      ? family.previousVersionId
        ? `Version ${family.version} registered on the blockchain successfully`
        : 'Document registered on the blockchain successfully'
      : family.previousVersionId
        ? `Version ${family.version} uploaded. Register it on the blockchain when you're ready.`
        : 'Document uploaded. It will appear as pending until you register it on the blockchain.',
    data: { document },
  });
});

/**
 * POST /api/documents/:id/register
 * Confirms a previously PENDING document after the wallet has registered its
 * hash. Mirrors the on-chain verification done in createDocument.
 */
export const registerDocument = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }
  if (document.blockchainStatus === 'CONFIRMED') {
    throw ApiError.badRequest('This document is already registered on the blockchain.');
  }

  const { transactionHash, blockNumber } = req.body as {
    transactionHash: string;
    blockNumber?: number;
  };

  const validation = await blockchainService.validateRegistrationTx(transactionHash, document.sha256Hash);
  if (!validation.valid || !validation.details) {
    throw ApiError.badRequest(validation.reason ?? 'Blockchain transaction could not be verified.');
  }
  await assertRegistrationWallet(String(req.user!.id), validation.details.from);

  const updated = await DocumentModel.findByIdAndUpdate(
    document._id,
    {
      blockchainHash: document.sha256Hash,
      transactionHash,
      blockNumber: validation.details.blockNumber ?? blockNumber,
      contractAddress: env.blockchain.contractAddress.toLowerCase(),
      chainId: env.blockchain.chainId,
      blockchainStatus: 'CONFIRMED' as const,
      verificationStatus: 'VERIFIED' as const,
    },
    { new: true }
  );

  await logActivity({
    userId: String(req.user!.id),
    action: 'BLOCKCHAIN_REGISTER',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: { transactionHash, blockNumber: updated?.blockNumber },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Document registered on the blockchain successfully',
    data: { document: updated },
  });
});

export const getDocuments = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const sortBy = (req.query.sortBy as string) ?? 'uploadedAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  const allowedSort = new Set(['uploadedAt', 'originalName', 'fileSize', 'blockchainStatus']);
  const sortField = allowedSort.has(sortBy) ? sortBy : 'uploadedAt';

  const filter: Record<string, unknown> = {
    userId: req.user!.id,
    ...buildSearchFilter(req.query.search as string | undefined),
  };
  const status = req.query.status as string | undefined;
  if (status && status !== 'ALL') filter.blockchainStatus = status;

  const folderId = req.query.folderId as string | undefined;
  if (folderId === 'unfiled') {
    filter.folderId = { $in: [null, undefined] };
  } else if (folderId) {
    filter.folderId = folderId;
  }

  const tags = parseTagFilter(req.query.tag as string | string[] | undefined);
  if (tags) filter.tags = { $all: tags };

  const [docs, total] = await Promise.all([
    DocumentModel.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'fullName email'),
    DocumentModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Documents retrieved',
    data: {
      documents: docs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

export const getDocumentTags = asyncHandler(async (req: Request, res: Response) => {
  const aggregate = await DocumentModel.aggregate<{ _id: string; count: number }>([
    { $match: { userId: req.user!.id } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  res.json({
    success: true,
    message: 'Tags retrieved',
    data: {
      tags: aggregate.map(({ _id, count }) => ({ name: _id, count })),
    },
  });
});

export const updateDocumentOrganization = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const { folderId, tags } = req.body as { folderId?: string | null; tags?: string[] };

  if (folderId !== undefined) {
    if (folderId === null || folderId === '' || folderId === 'null') {
      document.folderId = null;
    } else {
      const folder = await FolderModel.findOne({ _id: folderId, userId: req.user!.id });
      if (!folder) throw ApiError.badRequest('The specified folder does not exist or does not belong to you');
      document.folderId = folder._id as never;
    }
  }

  if (tags !== undefined) {
    document.tags = Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
  }

  await document.save();

  res.json({
    success: true,
    message: 'Document organization updated',
    data: { document },
  });
});

export const getDocumentById = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id).populate(
    'userId',
    'fullName email'
  );
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId._id ?? document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  res.json({ success: true, message: 'Document retrieved', data: { document } });
});

/**
 * GET /api/documents/:id/versions
 * Returns the full version history of a document family, oldest first, with the
 * current (latest) revision flagged. Owner or admin only.
 */
export const getDocumentVersions = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const familyId = String(document.familyId ?? document._id);
  const familyDocs = await DocumentModel.find({
    $or: [{ _id: familyId }, { familyId }],
  })
    .sort({ version: 1 })
    .populate('userId', 'fullName email');

  let maxVersion = 1;
  for (const d of familyDocs) {
    maxVersion = Math.max(maxVersion, d.version ?? 1);
  }

  const versions = familyDocs.map((d) => {
    const version = d.version ?? 1;
    return {
      document: d,
      version,
      isCurrent: version === maxVersion,
      isSuperseded: version < maxVersion,
    };
  });

  res.json({
    success: true,
    message: 'Document versions retrieved',
    data: { familyId, currentVersion: maxVersion, versions },
  });
});

export const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && (document.encryption || req.user!.role !== 'ADMIN')) {
    throw ApiError.forbidden(
      document.encryption
        ? 'This document is end-to-end encrypted. Only the owner can decrypt it.'
        : 'You do not have access to this document'
    );
  }

  const existsOnDisk = await storageProvider.exists(document.storagePath);
  if (!existsOnDisk) throw ApiError.notFound('File is no longer available on the server');

  await DownloadRecord.create({
    documentId: document._id,
    requesterId: req.user!.id,
    method: isOwner ? 'OWNER' : 'ADMIN',
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  await logActivity({
    userId: String(req.user!.id),
    action: 'DOCUMENT_DOWNLOAD',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: { name: document.originalName, hash: document.sha256Hash },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  setEncryptedFileHeaders(res, document, {
    wrappedKey: document.encryption?.wrappedKey,
    keyIv: document.encryption?.keyIv,
    wrapAlg: 'AES-GCM-VAULT',
  });
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.sendFile(path.resolve(process.cwd(), 'uploads', path.basename(document.storagePath)));
});

/**
 * GET /api/documents/:id/downloads
 * Audit trail of everyone who downloaded this document (owner, admins, and
 * approved access recipients). Owner or admin only.
 */
export const getDocumentDownloads = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));

  const records = await DownloadRecord.find({ documentId: document._id })
    .sort({ downloadedAt: -1 })
    .limit(limit)
    .populate('requesterId', 'fullName email')
    .populate('requestId', 'status');

  res.json({
    success: true,
    message: 'Download records retrieved',
    data: { downloads: records },
  });
});

/**
 * GET /api/documents/:id/download-code
 * Returns the current share-able download code (rotates every 20 minutes).
 * Owner or admin only.
 */
export const getDownloadCode = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const info = await getOrCreateDownloadCode(document._id);
  res.json({
    success: true,
    message: 'Download code retrieved',
    data: { downloadCode: info },
  });
});

/**
 * POST /api/documents/:id/download-code/regenerate
 * Force a brand-new code immediately. Owner or admin only.
 */
export const regenerateDownloadCodeHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const document = await DocumentModel.findById(req.params.id);
    if (!document) throw ApiError.notFound('Document not found');

    const isOwner = String(document.userId) === String(req.user!.id);
    if (!isOwner && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden('You do not have access to this document');
    }

    const info = await regenerateDownloadCode(document._id);
    res.json({
      success: true,
      message: 'A new download code has been generated',
      data: { downloadCode: info },
    });
  }
);

/** GET /api/documents/:id/share-key — wrapped keys used by secure share links. */
export const getShareKey = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  res.json({
    success: true,
    message: 'Share key retrieved',
    data: {
      shareKey: document.encryption
        ? {
            shareKeyWrapped: document.encryption.shareKeyWrapped ?? null,
            shareKeyWrapIv: document.encryption.shareKeyWrapIv ?? null,
            shareDekWrapped: document.encryption.shareDekWrapped ?? null,
            shareDekIv: document.encryption.shareDekIv ?? null,
          }
        : null,
    },
  });
});

/** PUT /api/documents/:id/share-key — store keys wrapped by the owner's vault. */
export const setShareKey = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id);
  if (!document) throw ApiError.notFound('Document not found');
  if (String(document.userId) !== String(req.user!.id)) {
    throw ApiError.forbidden('Only the document owner can configure a secure share link.');
  }
  if (!document.encryption) {
    throw ApiError.badRequest('This document is not end-to-end encrypted.');
  }

  const { shareKeyWrapped, shareKeyWrapIv, shareDekWrapped, shareDekIv } = req.body as {
    shareKeyWrapped: string;
    shareKeyWrapIv: string;
    shareDekWrapped: string;
    shareDekIv: string;
  };

  document.encryption.shareKeyWrapped = shareKeyWrapped;
  document.encryption.shareKeyWrapIv = shareKeyWrapIv;
  document.encryption.shareDekWrapped = shareDekWrapped;
  document.encryption.shareDekIv = shareDekIv;
  document.markModified('encryption');
  await document.save();

  res.json({
    success: true,
    message: 'Secure share link key saved',
    data: { document },
  });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.id).populate('userId', 'fullName email');
  if (!document) throw ApiError.notFound('Document not found');

  const isOwner = String(document.userId._id ?? document.userId) === String(req.user!.id);
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const ownerRef = document.userId as unknown as {
    _id: string;
    fullName?: string;
    email?: string;
  };
  const ownerId = String(ownerRef._id ?? ownerRef);
  const ownerName = ownerRef.fullName ?? 'the owner';

  await storageProvider.delete(document.storagePath);
  await Promise.all([
    DocumentModel.deleteOne({ _id: document._id }),
    DownloadCode.deleteMany({ documentId: document._id }),
    AccessRequest.deleteMany({ documentId: document._id }),
    DownloadRecord.deleteMany({ documentId: document._id }),
  ]);

  await logActivity({
    userId: String(req.user!.id),
    action: 'DOCUMENT_DELETE',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: {
      name: document.originalName,
      hash: document.sha256Hash,
      ownerId,
      ownerName,
      deletedBy: isAdmin && !isOwner ? 'ADMIN' : 'OWNER',
      adminName: isAdmin ? req.user!.fullName : undefined,
    },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  if (isAdmin && !isOwner) {
    await notifyDocumentDeleted({
      ownerId,
      deleterId: String(req.user!.id),
      documentId: String(document._id),
      documentName: document.originalName,
      adminName: req.user!.fullName ?? 'An admin',
      hash: document.sha256Hash,
    });
  }

  res.json({
    success: true,
    message: 'Document deleted. Note: the blockchain record is permanent and cannot be removed.',
    data: {},
  });
});
