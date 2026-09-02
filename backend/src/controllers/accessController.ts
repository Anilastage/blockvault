import crypto from 'crypto';
import path from 'path';
import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { AccessRequest, type IAccessRequest } from '../models/AccessRequest';
import { DownloadRecord } from '../models/DownloadRecord';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { createNotification } from '../services/notificationService';
import { logActivity, clientMeta } from '../services/activityService';
import { storageProvider } from '../services/storageService';

const ACCESS_LINK_TTL_MS = 15 * 60 * 1000; // Links stay valid for 15 minutes.

const isUnexpiredApproved = (request: IAccessRequest): boolean =>
  request.status === 'APPROVED' &&
  !request.usedAt &&
  !!request.expiresAt &&
  request.expiresAt.getTime() > Date.now();

/** Lazily persist PENDING/APPROVED links that can never be used again. */
const expireStale = async (requests: IAccessRequest[]): Promise<void> => {
  const stale = requests.filter(
    (r) =>
      r.status === 'APPROVED' &&
      !r.usedAt &&
      (!r.expiresAt || r.expiresAt.getTime() <= Date.now())
  );
  if (stale.length) {
    await AccessRequest.updateMany(
      { _id: { $in: stale.map((r) => r._id) } },
      { status: 'EXPIRED' }
    );
    for (const r of stale) r.status = 'EXPIRED';
  }
};

/** POST /api/access/requests — requester asks the owner for a copy. */
export const requestAccess = asyncHandler(async (req: Request, res: Response) => {
  const { documentId, reason } = req.body as { documentId: string; reason?: string };

  const document = await DocumentModel.findById(documentId);
  if (!document) throw ApiError.notFound('Document not found');
  if (document.blockchainStatus !== 'CONFIRMED') {
    throw ApiError.badRequest('This document is not registered on the blockchain.');
  }

  const requesterId = String(req.user!.id);
  if (req.user!.role === 'ADMIN') {
    throw ApiError.badRequest('Admins may download any registered document directly.');
  }
  if (String(document.userId) === requesterId) {
    throw ApiError.badRequest('You already own this document.');
  }

  // De-dupe: return an actionable existing request instead of spamming the owner.
  const existing = await AccessRequest.findOne({
    documentId: document._id,
    requesterId: req.user!.id,
    status: { $in: ['PENDING', 'APPROVED'] },
  });

  if (existing) {
    if (!isUnexpiredApproved(existing)) await expireStale([existing]);
    return res.status(200).json({
      success: true,
      message: 'You already have a pending access request for this document.',
      data: { request: existing },
    });
  }

  const request = await AccessRequest.create({
    documentId: document._id,
    requesterId: req.user!.id,
    reason: reason?.trim() || undefined,
    status: 'PENDING',
  });

  const requester = await User.findById(requesterId);
  await createNotification({
    userId: String(document.userId),
    type: 'ACCESS_REQUESTED',
    title: 'Document access requested',
    message: `${requester?.fullName ?? 'A user'} (${requester?.email ?? ''}) requested a copy of your document "${document.originalName}".`,
    entityId: String(document._id),
    metadata: { requestId: String(request._id), documentId: String(document._id) },
  });

  await logActivity({
    userId: requesterId,
    action: 'ACCESS_REQUESTED',
    entityType: 'ACCESS_REQUEST',
    entityId: String(request._id),
    metadata: { documentId: String(document._id), name: document.originalName },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.status(201).json({
    success: true,
    message: 'Access request sent to the document owner.',
    data: { request },
  });
});

/** GET /api/access/requests/mine — requests I sent (outbox). */
export const getMyRequests = asyncHandler(async (req: Request, res: Response) => {
  const query: Record<string, unknown> = { requesterId: req.user!.id };
  const status = req.query.status as string | undefined;
  if (status && status !== 'ALL') query.status = status;
  if (req.query.documentId) query.documentId = (req.query.documentId as string).trim();

  const requests = await AccessRequest.find(query)
    .sort({ createdAt: -1 })
    .populate({
      path: 'documentId',
      select: 'originalName fileSize mimeType userId',
      populate: { path: 'userId', select: 'fullName' },
    });

  await expireStale(requests as unknown as IAccessRequest[]);

  res.json({ success: true, message: 'Access requests retrieved', data: { requests } });
});

/** GET /api/access/requests — requests on my documents (inbox). */
export const getIncomingRequests = asyncHandler(async (req: Request, res: Response) => {
  const status = (req.query.status as string | undefined) ?? 'PENDING';
  const myDocs = await DocumentModel.find({ userId: req.user!.id }).select('_id');
  const docIds = myDocs.map((d) => d._id);

  const query: Record<string, unknown> = { status };
  // Admins can see requests across all documents; regular users are scoped to
  // requests on documents they own.
  if (req.user!.role !== 'ADMIN') query.documentId = { $in: docIds };

  const requests = await AccessRequest.find(query)
    .sort({ createdAt: -1 })
    .populate('requesterId', 'fullName email')
    .populate('documentId', 'originalName fileSize mimeType');

  res.json({
    success: true,
    message: 'Access requests retrieved',
    data: { requests, pending: requests.length },
  });
});

const assertCanDecide = (req: Request, requestOwnerId: string): void => {
  const isOwner = String(requestOwnerId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('Only the document owner can approve or deny this request.');
  }
};

/** POST /api/access/requests/:id/approve */
export const approveRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await AccessRequest.findById(req.params.id).populate('documentId');
  if (!request) throw ApiError.notFound('Access request not found');
  const document = request.documentId as unknown as { userId: string; originalName?: string };
  assertCanDecide(req, String(document.userId));

  if (request.status !== 'PENDING') {
    throw ApiError.conflict('This request has already been decided.');
  }

  request.status = 'APPROVED';
  request.accessToken = crypto.randomBytes(32).toString('hex');
  request.expiresAt = new Date(Date.now() + ACCESS_LINK_TTL_MS);
  request.decidedBy = req.user!.id;
  request.decidedAt = new Date();
  await request.save();

  const requester = await User.findById(request.requesterId);
  await createNotification({
    userId: String(request.requesterId),
    type: 'ACCESS_APPROVED',
    title: 'Download access approved',
    message: `${req.user!.fullName} approved your request to download "${document.originalName}". Your secure one-time link is ready.`,
    entityId: String(document),
    metadata: { requestId: String(request._id), expiresAt: request.expiresAt.toISOString() },
  });

  res.json({
    success: true,
    message: 'Access approved. The requester can now download the document.',
    data: { request },
  });
});

/** POST /api/access/requests/:id/deny */
export const denyRequest = asyncHandler(async (req: Request, res: Response) => {
  const request = await AccessRequest.findById(req.params.id).populate('documentId');
  if (!request) throw ApiError.notFound('Access request not found');
  const document = request.documentId as unknown as { userId: string; originalName?: string };
  assertCanDecide(req, String(document.userId));

  if (request.status !== 'PENDING') {
    throw ApiError.conflict('This request has already been decided.');
  }

  request.status = 'DENIED';
  request.decidedBy = req.user!.id;
  request.decidedAt = new Date();
  await request.save();

  await createNotification({
    userId: String(request.requesterId),
    type: 'ACCESS_DENIED',
    title: 'Download access denied',
    message: `${req.user!.fullName} declined your request to download "${document.originalName}".`,
    entityId: String(document),
    metadata: { requestId: String(request._id) },
  });

  res.json({
    success: true,
    message: 'Access request denied.',
    data: { request },
  });
});

/**
 * GET /api/access/requests/:token/download
 * One-time, expiring, server-side link. The file is streamed only once; the
 * link is invalidated after the first successful fetch.
 */
export const downloadWithToken = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.params.token as string).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) throw ApiError.notFound('Download link not found');

  const existing = await AccessRequest.findOne({ accessToken: token });
  if (!existing) throw ApiError.notFound('Download link not found');

  const document = await DocumentModel.findById(existing.documentId);
  if (!document) throw ApiError.notFound('Document record not found');
  if (document.blockchainStatus !== 'CONFIRMED') {
    throw ApiError.badRequest('This document is not registered on the blockchain.');
  }

  const existsOnDisk = await storageProvider.exists(document.storagePath);
  if (!existsOnDisk) throw ApiError.notFound('File is no longer available on the server');

  // Atomically consume the one-time token. Exactly one concurrent request can win
  // this conditional update, which closes the read-then-write (TOCTOU) race where
  // two parallel requests could both pass the "not used yet" check. `new: false`
  // returns the pre-update document so logging sees the original requester/_id.
  const request = await AccessRequest.findOneAndUpdate(
    { _id: existing._id, status: 'APPROVED', usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { status: 'USED', usedAt: new Date() } },
    { new: false }
  );

  if (!request) {
    // Lost the race, already consumed, or expired — give a helpful message.
    const current = await AccessRequest.findById(existing._id);
    if (current && current.status === 'APPROVED') {
      throw ApiError.badRequest('This download link has expired. Request a new one from the owner.');
    }
    throw ApiError.badRequest('This download link has already been used.');
  }

  await DownloadRecord.create({
    documentId: document._id,
    requesterId: request.requesterId,
    method: 'ACCESS_GRANT',
    requestId: request._id,
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  await logActivity({
    userId: String(request.requesterId),
    action: 'DOCUMENT_DOWNLOAD',
    entityType: 'DOCUMENT',
    entityId: String(document._id),
    metadata: { name: document.originalName, hash: document.sha256Hash, viaHash: true, granted: true },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  const downloader = await User.findById(request.requesterId);
  await createNotification({
    userId: String(document.userId),
    type: 'DOCUMENT_DOWNLOADED',
    title: 'Document downloaded',
    message: `${downloader?.fullName ?? 'A registered user'} downloaded "${document.originalName}" using the one-time link you approved.`,
    entityId: String(document._id),
    metadata: { requestId: String(request._id) },
  });

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.sendFile(path.resolve(process.cwd(), 'uploads', path.basename(document.storagePath)));
});