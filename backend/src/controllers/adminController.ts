import type { Request, Response } from 'express';
import { User } from '../models/User';
import { DocumentModel } from '../models/Document';
import { Verification } from '../models/Verification';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));

  const filter: Record<string, unknown> = {};
  const search = req.query.search as string | undefined;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }, { walletAddress: rx }];
  }
  const role = req.query.role as string | undefined;
  if (role && role !== 'ALL') filter.role = role;
  const isActive = req.query.isActive as string | undefined;
  if (isActive && isActive !== 'ALL') filter.isActive = isActive === 'true';

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Users retrieved',
    data: {
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

export const changeUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: 'USER' | 'ADMIN' };
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  if (String(target._id) === String(req.user!.id)) {
    throw ApiError.badRequest('You cannot change your own role.');
  }

  target.role = role;
  await target.save();

  await logActivity({
    userId: String(req.user!.id),
    action: 'ADMIN_CHANGE_ROLE',
    entityType: 'USER',
    entityId: String(target._id),
    metadata: { newRole: role, email: target.email },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({ success: true, message: `Role updated to ${role}`, data: { user: target } });
});

export const changeUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');

  if (String(target._id) === String(req.user!.id)) {
    throw ApiError.badRequest('You cannot disable your own account.');
  }

  target.isActive = isActive;
  await target.save();

  await logActivity({
    userId: String(req.user!.id),
    action: isActive ? 'ADMIN_ENABLE_USER' : 'ADMIN_DISABLE_USER',
    entityType: 'USER',
    entityId: String(target._id),
    metadata: { email: target.email },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: isActive ? 'Account enabled' : 'Account disabled',
    data: { user: target },
  });
});

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));

  const filter: Record<string, unknown> = {};
  const search = req.query.search as string | undefined;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ originalName: rx }, { sha256Hash: rx }, { transactionHash: rx }];
  }
  const status = req.query.status as string | undefined;
  if (status && status !== 'ALL') filter.blockchainStatus = status;

  const [docs, total] = await Promise.all([
    DocumentModel.find(filter)
      .sort({ uploadedAt: -1 })
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

export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const filter = { transactionHash: { $exists: true, $ne: '' } };

  const [docs, total] = await Promise.all([
    DocumentModel.find(filter)
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'fullName email'),
    DocumentModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Blockchain transactions retrieved',
    data: {
      transactions: docs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

export const getSystemAnalytics = asyncHandler(async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    totalDocuments,
    totalVerifications,
    confirmedTx,
    failedTx,
    pendingTx,
    recentUsers,
    recentDocs,
    recentVerifications,
    recentActivity,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    DocumentModel.countDocuments({}),
    Verification.countDocuments({}),
    DocumentModel.countDocuments({ blockchainStatus: 'CONFIRMED' }),
    DocumentModel.countDocuments({ blockchainStatus: 'FAILED' }),
    DocumentModel.countDocuments({ blockchainStatus: 'PENDING' }),
    User.find({ createdAt: { $gte: since } }).select('createdAt'),
    DocumentModel.find({ uploadedAt: { $gte: since } }).select('uploadedAt verificationStatus'),
    Verification.find({ verifiedAt: { $gte: since } }).select('verifiedAt result'),
    ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'fullName email role'),
  ]);

  const byDate = new Map<string, { users: number; uploads: number; verifications: number }>();
  const timeline: Array<{ date: string; users: number; uploads: number; verifications: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { users: 0, uploads: 0, verifications: 0 });
    timeline.push({ date: key, ...byDate.get(key)! });
  }
  for (const u of recentUsers) {
    byDate.get(new Date(u.createdAt ?? 0).toISOString().slice(0, 10))!.users += 1;
  }
  for (const d of recentDocs) {
    byDate.get(new Date(d.uploadedAt).toISOString().slice(0, 10))!.uploads += 1;
  }
  for (const v of recentVerifications) {
    byDate.get(new Date(v.verifiedAt).toISOString().slice(0, 10))!.verifications += 1;
  }

  const verifiedCount = recentDocs.filter((d) => d.verificationStatus === 'VERIFIED').length;
  const modifiedCount = recentDocs.filter((d) => d.verificationStatus === 'MODIFIED').length;

  res.json({
    success: true,
    message: 'System analytics retrieved',
    data: {
      stats: {
        totalUsers,
        activeUsers,
        totalDocuments,
        totalVerifications,
        blockchainTransactions: confirmedTx + failedTx + pendingTx,
        failedTransactions: failedTx,
        pendingTransactions: pendingTx,
      },
      timeline,
      documentIntegrity: [
        { name: 'Verified', value: verifiedCount },
        { name: 'Modified', value: modifiedCount },
      ],
      recentActivity,
    },
  });
});

export const listActivityLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 15)));
  const action = req.query.action as string | undefined;

  const filter: Record<string, unknown> = {};
  if (action && action !== 'ALL') filter.action = action;

  // Shared global ledger — every user (admin or not) sees the full
  // chronological activity history across the whole project, mirroring the
  // transparent, append-only nature of the blockchain.
  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'fullName email role'),
    ActivityLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Activity logs retrieved',
    data: {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});
