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
 * Create a document record after the wallet has registered its hash on-chain.
 * Accepts multipart form data: the file plus its claimed metadata.
 * The server re-hashes the actual bytes and independently verifies that the
 * submitted transaction really registered this hash in the smart contract.
 */
export const createDocument = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Document file is required');

  const { originalName, fileSize, mimeType, sha256Hash, transactionHash, blockNumber } =
    req.body as {
      originalName: string;
      fileSize: number;
      mimeType: string;
      sha256Hash: string;
      transactionHash: string;
      blockNumber?: number;
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

  // 2. Transaction must genuinely exist and register this exact hash.
  const validation = await validateRegistrationTx(transactionHash, computedHash);
  if (!validation.valid || !validation.details) {
    await fs.unlink(file.path).catch(() => undefined);
    throw ApiError.badRequest(validation.reason ?? 'Blockchain transaction could not be verified.');
  }

  const document = await DocumentModel.create({
    userId: req.user!.id,
    originalName,
    fileName: path.basename(file.filename),
    fileSize: file.size,
    mimeType,
    storagePath: file.filename,
    sha256Hash: computedHash,
    blockchainHash: computedHash,
    transactionHash,
    blockNumber: validation.details.blockNumber ?? blockNumber,
    contractAddress: env.blockchain.contractAddress.toLowerCase(),
    chainId: env.blockchain.chainId,
    uploadedAt: new Date(),
    blockchainStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED',
  }).catch(async (err: Error) => {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  });

  await logActivity({
    userId: String(req.user!.id),
    action: 'DOCUMENT_UPLOAD',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: {
      name: originalName,
      hash: computedHash,
      transactionHash,
    },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });
  await logActivity({
    userId: String(req.user!.id),
    action: 'BLOCKCHAIN_REGISTER',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: { transactionHash, blockNumber: document.blockNumber },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.status(201).json({
    success: true,
    message: 'Document registered on the blockchain successfully',
    data: { document },
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
