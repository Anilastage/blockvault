import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { Verification } from '../models/Verification';
import { DownloadRecord } from '../models/DownloadRecord';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { sha256File } from '../utils/hash';
import fs from 'fs/promises';
import path from 'path';
import { lookupOnChain } from '../services/blockchainService';
import { logActivity, clientMeta } from '../services/activityService';
import { notifyDocumentVerified } from '../services/notificationService';
import { storageProvider } from '../services/storageService';

interface VerifyOutcome {
  result: 'VERIFIED' | 'MODIFIED' | 'NOT_FOUND';
  calculatedHash: string;
  chain: {
    exists: boolean;
    owner: string;
    timestamp: number;
    blockNumber: number;
    transactionHash?: string;
  };
  blockchainHash?: string;
  document?: {
    id: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    ownerName: string;
    /** Whether the current user owns the matched document (affects download access). */
    ownedByMe: boolean;
  };
}

const performLookup = async (
  userId: string | undefined,
  documentId: string | undefined,
  calculatedHash: string,
  meta: { ipAddress?: string; userAgent?: string }
): Promise<VerifyOutcome> => {
  const chain = await lookupOnChain(calculatedHash);

  let outcome: VerifyOutcome;

  if (!chain.exists) {
    // If tied to a known document, check whether THAT document's registered
    // hash still matches the uploaded bytes (modified-file detection).
    if (documentId) {
      const doc = await DocumentModel.findById(documentId);
      if (doc && doc.sha256Hash !== calculatedHash) {
        const originalChain = await lookupOnChain(doc.sha256Hash);
        if (originalChain.exists) {
          outcome = {
            result: 'MODIFIED',
            calculatedHash,
            blockchainHash: doc.sha256Hash,
            chain: {
              exists: true,
              owner: originalChain.owner,
              timestamp: originalChain.timestamp,
              blockNumber: originalChain.blockNumber,
              transactionHash: originalChain.transactionHash,
            },
          };
          if (userId) {
            await Verification.create({
            documentId: doc._id,
            userId,
            calculatedHash,
            blockchainHash: doc.sha256Hash,
            result: 'MODIFIED',
            transactionHash: originalChain.transactionHash,
            blockNumber: originalChain.blockNumber,
            ownerWallet: originalChain.owner.toLowerCase(),
            registeredAt: new Date(originalChain.timestamp * 1000),
            verifiedAt: new Date(),
            ...meta,
          });
          }
          await DocumentModel.findByIdAndUpdate(doc._id, { verificationStatus: 'MODIFIED' });
          return outcome;
        }
      }
    }

    outcome = {
      result: 'NOT_FOUND',
      calculatedHash,
      chain: { exists: false, owner: '', timestamp: 0, blockNumber: 0 },
    };
    if (userId) {
      await Verification.create({
        documentId,
        userId,
        calculatedHash,
        result: 'NOT_FOUND',
        verifiedAt: new Date(),
        ...meta,
      });
    }
    if (documentId) {
      await DocumentModel.findByIdAndUpdate(documentId, { verificationStatus: 'NOT_FOUND' });
    }
    return outcome;
  }

  // If the hash exists on-chain, also surface the stored record so the verifier
  // can see the original document. Download access for the owner is direct;
  // everyone else must be approved by the owner first.
  const registeredDoc = chain.exists
    ? await DocumentModel.findOne({ sha256Hash: calculatedHash }).populate('userId', 'fullName')
    : null;

  const ownerUser = registeredDoc?.userId as
    | { _id: unknown; fullName?: string }
    | null
    | undefined;
  const isOwnedByMe =
    userId != null &&
    registeredDoc != null &&
    ownerUser?._id != null &&
    String(ownerUser._id) === String(userId);

  // Notify the owner when a third party verifies a copy of their document.
  if (registeredDoc && ownerUser?._id) {
    try {
      let verifierName = 'A visitor';
      let verifierId = '';
      if (userId) {
        const verifier = await User.findById(userId).select('fullName email');
        verifierName = verifier?.fullName ?? 'Someone';
        verifierId = userId;
      }
      await notifyDocumentVerified({
        ownerId: String(ownerUser._id),
        documentId: String(registeredDoc._id),
        documentName: registeredDoc.originalName,
        verifierId,
        verifierName,
        hash: calculatedHash,
      });
    } catch {
      // Notification is best-effort; never break the verification flow.
    }
  }

  outcome = {
    result: 'VERIFIED',
    calculatedHash,
    blockchainHash: calculatedHash,
    chain,
    document: registeredDoc
      ? {
          id: String(registeredDoc._id),
          originalName: registeredDoc.originalName,
          mimeType: registeredDoc.mimeType,
          fileSize: registeredDoc.fileSize,
          ownerName: (ownerUser as { fullName?: string } | null)?.fullName ?? 'Unknown owner',
          ownedByMe: isOwnedByMe,
        }
      : undefined,
  };
  const linkedDoc = documentId
    ? await DocumentModel.findOne({
        _id: documentId,
        sha256Hash: calculatedHash,
      })
    : userId
      ? await DocumentModel.findOne({ sha256Hash: calculatedHash, userId })
      : null;

  if (userId) {
    await Verification.create({
      documentId: linkedDoc?._id ?? documentId,
      userId,
      calculatedHash,
      blockchainHash: calculatedHash,
      result: 'VERIFIED',
      transactionHash: chain.transactionHash,
      blockNumber: chain.blockNumber,
      ownerWallet: chain.owner.toLowerCase(),
      registeredAt: new Date(chain.timestamp * 1000),
      verifiedAt: new Date(),
      ...meta,
    });
  }
  if (linkedDoc) {
    await DocumentModel.findByIdAndUpdate(linkedDoc._id, { verificationStatus: 'VERIFIED' });
  }
  return outcome;
};

/** POST /api/verification/upload — multipart file upload for verification. */
export const verifyUploadedFile = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('A document file is required for verification');

  const documentId = req.body?.documentId as string | undefined;
  const calculatedHash = await sha256File(file.path);
  await fs.unlink(file.path).catch(() => undefined);

  const outcome = await performLookup(String(req.user!.id), documentId, calculatedHash, {
    ipAddress: clientMeta(req.ip, req.headers['user-agent']).ipAddress,
    userAgent: req.headers['user-agent'],
  });

  await logActivity({
    userId: String(req.user!.id),
    action: 'DOCUMENT_VERIFY',
    entityType: 'VERIFICATION',
    metadata: { hash: calculatedHash, result: outcome.result },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({ success: true, message: `Verification complete: ${outcome.result}`, data: outcome });
});

/** POST /api/verification/hash — verify a pasted SHA-256 hash. */
export const verifyByHash = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.body as { hash: string };
  const documentId = req.body?.documentId as string | undefined;
  const calculatedHash = hash.toLowerCase();

  const outcome = await performLookup(String(req.user!.id), documentId, calculatedHash, {
    ipAddress: clientMeta(req.ip, req.headers['user-agent']).ipAddress,
    userAgent: req.headers['user-agent'],
  });

  await logActivity({
    userId: String(req.user!.id),
    action: 'DOCUMENT_VERIFY',
    entityType: 'VERIFICATION',
    metadata: { hash: calculatedHash, result: outcome.result },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({ success: true, message: `Verification complete: ${outcome.result}`, data: outcome });
});

/**
 * POST /api/verification/public/upload — same check as verifyUploadedFile but
 * for unauthenticated visitors. No verification history is recorded and there
 * is no activity log (there is no user); the on-chain lookup and owner
 * notification still work so document owners stay informed.
 */
export const verifyUploadedFilePublic = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('A document file is required for verification');

  const documentId = req.body?.documentId as string | undefined;
  const calculatedHash = await sha256File(file.path);
  await fs.unlink(file.path).catch(() => undefined);

  const outcome = await performLookup(undefined, documentId, calculatedHash, {});

  res.json({ success: true, message: `Verification complete: ${outcome.result}`, data: outcome });
});

/** POST /api/verification/public/hash — public version of verifyByHash. */
export const verifyByHashPublic = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.body as { hash: string };
  const documentId = req.body?.documentId as string | undefined;
  const calculatedHash = hash.toLowerCase();

  const outcome = await performLookup(undefined, documentId, calculatedHash, {});

  res.json({ success: true, message: `Verification complete: ${outcome.result}`, data: outcome });
});

/** GET /api/verification/history — current user's verification history. */
export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const filter: Record<string, unknown> = { userId: req.user!.id };
  const resultFilter = req.query.status as string | undefined;
  if (resultFilter && resultFilter !== 'ALL') filter.result = resultFilter;

  // Date range filter
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const dateFilter: Record<string, Date> = {};
  if (from && !isNaN(from.getTime())) dateFilter.$gte = from;
  if (to && !isNaN(to.getTime())) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }
  if (Object.keys(dateFilter).length) filter.verifiedAt = dateFilter;

  // Search by hash, or by linked document name.
  const search = (req.query.search as string | undefined)?.trim();
  if (search) {
    const isHashish = /^[a-fA-F0-9]{6,64}$/.test(search);
    const conditions: Array<Record<string, unknown>> = [
      { calculatedHash: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
    if (!isHashish) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const docs = await DocumentModel.find({ originalName: rx }).select('_id');
      conditions.push({ documentId: { $in: docs.map((d) => d._id) } });
    }
    filter.$or = conditions;
  }

  const [records, total] = await Promise.all([
    Verification.find(filter)
      .sort({ verifiedAt: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('documentId', 'originalName'),
    Verification.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Verification history retrieved',
    data: {
      verifications: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

/** GET /api/verification/:documentId — verification history of one document. */
export const getDocumentVerifications = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.documentId);
  if (!document) throw ApiError.notFound('Document not found');
  if (String(document.userId) !== String(req.user!.id) && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this document');
  }

  const records = await Verification.find({ documentId: document._id }).sort({ verifiedAt: -1 });
  res.json({
    success: true,
    message: 'Verification records retrieved',
    data: { verifications: records },
  });
});

/**
 * GET /api/verification/download/:documentId
 * Streams the ORIGINAL stored document for any record that is confirmed on the
 * blockchain. The document owner and admins may download directly; anyone else
 * must first be approved by the owner (see /api/access/requests), so downloads
 * are gated by explicit owner consent instead of being open to anyone with a
 * hash.
 */
export const downloadRegisteredDocument = asyncHandler(async (req: Request, res: Response) => {
  const document = await DocumentModel.findById(req.params.documentId);
  if (!document) throw ApiError.notFound('Document record not found');
  if (document.blockchainStatus !== 'CONFIRMED') {
    throw ApiError.badRequest('This document is not registered on the blockchain.');
  }

  const isOwner = String(document.userId) === String(req.user!.id);
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden(
      'This document is owned by someone else. Request access from the owner to download it.'
    );
  }

  const existsOnDisk = await storageProvider.exists(document.storagePath);
  if (!existsOnDisk) throw ApiError.notFound('File is no longer available on the server');

  await DownloadRecord.create({
    documentId: document._id,
    requesterId: req.user!.id,
    method: isAdmin ? 'ADMIN' : 'OWNER',
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
