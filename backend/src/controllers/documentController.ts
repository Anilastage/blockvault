import fs from 'fs/promises';
import path from 'path';
import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { DownloadRecord } from '../models/DownloadRecord';
import { DownloadCode } from '../models/DownloadCode';
import { AccessRequest } from '../models/AccessRequest';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { sha256File } from '../utils/hash';
import { env } from '../config/env';
import { validateRegistrationTx } from '../services/blockchainService';
import { logActivity, clientMeta } from '../services/activityService';
import { notifyDocumentDeleted } from '../services/notificationService';
import { storageProvider } from '../services/storageService';
import {
  getOrCreateDownloadCode,
  regenerateDownloadCode,
} from '../services/downloadCodeService';

const buildSearchFilter = (search: string | undefined) => {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return {
    $or: [{ originalName: rx }, { sha256Hash: rx }, { transactionHash: rx }],
  };
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

  const { originalName, fileSize, mimeType, sha256Hash, transactionHash, blockNumber, parentId } =
    req.body as {
      originalName: string;
      fileSize: number;
      mimeType: string;
      sha256Hash: string;
      transactionHash?: string;
      blockNumber?: number;
      parentId?: string;
    };

  // 1. Hash must match the real file bytes.
  const computedHash = await sha256File(file.path);
  if (computedHash !== sha256Hash.toLowerCase()) {
    await fs.unlink(file.path).catch(() => undefined);
    throw ApiError.badRequest(
      'The uploaded file does not match the hash registered on the blockchain.'
    );
  }
  if (file.size !== Number(fileSize)) {
    await fs.unlink(file.path).catch(() => undefined);
    throw ApiError.badRequest('File size mismatch.');
  }

  let validatedTx = undefined;
  // 2. When a transaction is supplied it must genuinely exist and register
  // this exact hash.
  if (transactionHash) {
    const validation = await validateRegistrationTx(transactionHash, computedHash);
    if (!validation.valid || !validation.details) {
      await fs.unlink(file.path).catch(() => undefined);
      throw ApiError.badRequest(
        validation.reason ?? 'Blockchain transaction could not be verified.'
      );
    }
    validatedTx = validation.details;
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

  const document = await DocumentModel.create({
    userId: req.user!.id,
    originalName,
    fileName: path.basename(file.filename),
    fileSize: file.size,
    mimeType,
    storagePath: file.filename,
    sha256Hash: computedHash,
    blockchainHash: validatedTx ? computedHash : undefined,
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
      hash: computedHash,
      transactionHash,
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

  const validation = await validateRegistrationTx(transactionHash, document.sha256Hash);
  if (!validation.valid || !validation.details) {
    throw ApiError.badRequest(validation.reason ?? 'Blockchain transaction could not be verified.');
  }

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
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
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
