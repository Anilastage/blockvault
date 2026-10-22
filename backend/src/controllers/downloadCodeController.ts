import path from 'path';
import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { DownloadRecord } from '../models/DownloadRecord';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { findValidDownloadCode } from '../services/downloadCodeService';
import { logActivity, clientMeta } from '../services/activityService';
import { storageProvider } from '../services/storageService';
import { createNotification } from '../services/notificationService';
import { setEncryptedFileHeaders } from '../utils/encryptionHeaders';

/**
 * POST /api/download/code
 * Authenticated â€” the signed-in user holding a valid (unexpired) share-able
 * code downloads the associated document. The rotating code is the credential,
 * and because the user must be logged in, every download is attributed by name
 * in the audit trail and to the owner.
 */
export const downloadByCode = asyncHandler(async (req: Request, res: Response) => {
  const submitted = (req.body?.code as string | undefined) ?? '';
  const code = submitted.trim().toUpperCase();
  if (code.length < 6) throw ApiError.badRequest('Please enter a valid download code.');

  const lookup = await findValidDownloadCode(code);
  if (!lookup) {
    throw ApiError.badRequest(
      'This code is invalid or has expired. Ask the document owner for a fresh code (codes rotate every 20 minutes).'
    );
  }

  const document = await DocumentModel.findById(lookup.documentId);
  if (!document) throw ApiError.notFound('Document record not found');
  if (document.blockchainStatus !== 'CONFIRMED') {
    throw ApiError.badRequest('This document is not registered on the blockchain.');
  }

  const existsOnDisk = await storageProvider.exists(document.storagePath);
  if (!existsOnDisk) throw ApiError.notFound('File is no longer available on the server');

  const actor = req.user!;

  await DownloadRecord.create({
    documentId: document._id,
    requesterId: actor.id,
    method: 'SHARE_CODE',
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  await logActivity({
    userId: String(actor.id),
    action: 'DOCUMENT_DOWNLOAD',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: {
      name: document.originalName,
      hash: document.sha256Hash,
      viaShareCode: true,
    },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  const downloaderName = actor.fullName ?? 'A registered user';
  await createNotification({
    userId: String(document.userId),
    type: 'DOCUMENT_DOWNLOADED',
    title: 'Document downloaded',
    message: `${downloaderName} downloaded "${document.originalName}" using a share code.`,
    entityId: String(document._id),
    metadata: { documentId: String(document._id), viaShareCode: true },
  });

  if (document.encryption) {
    setEncryptedFileHeaders(res, document, {
      wrappedKey: document.encryption.shareDekWrapped,
      keyIv: document.encryption.shareDekIv,
      wrapAlg: 'AES-GCM-SHARE',
    });
  }
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.sendFile(path.resolve(process.cwd(), 'uploads', path.basename(document.storagePath)));
});
