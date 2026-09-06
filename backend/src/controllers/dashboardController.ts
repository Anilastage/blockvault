import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { Verification } from '../models/Verification';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../middleware/errorHandler';

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  // Global (network-wide) stats plus the signed-in user's own documents.
  const [
    totalDocuments,
    yourDocuments,
    verifiedDocs,
    pendingTxs,
    verificationAttempts,
  ] = await Promise.all([
    DocumentModel.countDocuments({}),
    DocumentModel.countDocuments({ userId }),
    DocumentModel.countDocuments({ verificationStatus: 'VERIFIED' }),
    DocumentModel.countDocuments({ blockchainStatus: 'PENDING' }),
    Verification.countDocuments({}),
  ]);

  res.json({
    success: true,
    message: 'Dashboard statistics',
    data: {
      totalDocuments,
      yourDocuments,
      verifiedDocuments: verifiedDocs,
      pendingTransactions: pendingTxs,
      verificationAttempts,
    },
  });
});

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [recentUploads, recentVerifications, recentActivity] = await Promise.all([
    DocumentModel.find({ userId }).sort({ uploadedAt: -1 }).limit(5),
    Verification.find({ userId }).sort({ verifiedAt: -1 }).limit(5).populate('documentId', 'originalName'),
    // Global shared activity ledger — every user sees all project activity,
    // regardless of when their account was created.
    ActivityLog.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'fullName email role'),
  ]);

  res.json({
    success: true,
    message: 'Recent activity',
    data: {
      recentUploads,
      recentVerifications,
      recentActivity,
    },
  });
});

export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const since = daysAgo(30);

  const docs = await DocumentModel.find(
    { userId, uploadedAt: { $gte: since } },
    'uploadedAt blockchainStatus'
  ).lean();
  const verifications = await Verification.find(
    { userId, verifiedAt: { $gte: since } },
    'verifiedAt result'
  ).lean();

  // Build daily buckets for the last 30 days.
  const byDate = new Map<string, { uploads: number; verifications: number; transactions: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { uploads: 0, verifications: 0, transactions: 0 });
  }

  let confirmedTxs = 0;
  for (const doc of docs) {
    const key = new Date(doc.uploadedAt).toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (bucket) bucket.uploads += 1;
    if (doc.blockchainStatus === 'CONFIRMED') confirmedTxs += 1;
  }
  const resultCounts = { VERIFIED: 0, MODIFIED: 0, NOT_FOUND: 0 };
  for (const v of verifications) {
    const key = new Date(v.verifiedAt).toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (bucket) bucket.verifications += 1;
    if (v.result in resultCounts && bucket) bucket.transactions += 1;
    if (v.result === 'VERIFIED' || v.result === 'MODIFIED' || v.result === 'NOT_FOUND') {
      resultCounts[v.result as keyof typeof resultCounts] += 1;
    }
  }

  res.json({
    success: true,
    message: 'Analytics retrieved',
    data: {
      timeline: [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
      verificationResults: [
        { name: 'Verified', value: resultCounts.VERIFIED },
        { name: 'Modified', value: resultCounts.MODIFIED },
        { name: 'Not Found', value: resultCounts.NOT_FOUND },
      ],
      transactions: {
        total: docs.filter((d) => d.blockchainStatus !== 'PENDING').length,
        confirmed: confirmedTxs,
      },
    },
  });
});
