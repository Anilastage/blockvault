import type { Request, Response } from 'express';
import { DocumentModel } from '../models/Document';
import { Verification } from '../models/Verification';
import { asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Parses ?from&to into an inclusive $gte/$lte filter, defaulting to 30 days. */
const parseRange = (req: Request): { $gte?: Date; $lte?: Date } => {
  const parsed = rangeSchema.safeParse(req.query);
  const to = parsed.success && parsed.data.to ? endOfDay(parsed.data.to) : undefined;
  const from =
    parsed.success && parsed.data.from
      ? parsed.data.from
      : to
        ? undefined
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const range: { $gte?: Date; $lte?: Date } = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return range;
};

const endOfDay = (d: Date): Date => {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const dateKeyStage = (field: string) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}` },
});

function buildDailyBuckets<T extends Record<string, unknown>>(
  rows: Array<{ _id: string; count: number } & T>,
  from: Date,
  to: Date,
  extraDefaults: T
): Array<{ date: string; count: number } & T> {
  const byDate = new Map<string, { count: number } & T>();
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  while (cursor <= end) {
    byDate.set(cursor.toISOString().slice(0, 10), { count: 0, ...extraDefaults });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const row of rows) {
    const bucket = byDate.get(row._id);
    if (bucket) {
      bucket.count += row.count;
      Object.assign(bucket, Object.fromEntries(Object.entries(row).filter(([k]) => k !== '_id' && k !== 'count')));
    }
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
}

/**
 * GET /api/analytics/overview
 * Headline numbers for the analytics page, computed in MongoDB.
 */
export const overview = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const docRange = parseRange(req);

  const [totalDocuments, totalVerifications, verifiedVerifications, blockchainRegistrations, blockchainDocumentCount] =
    await Promise.all([
      DocumentModel.countDocuments({ userId }),
      Verification.countDocuments({ userId }),
      Verification.countDocuments({ userId, result: 'VERIFIED' }),
      DocumentModel.countDocuments({
        userId,
        transactionHash: { $exists: true, $ne: '' },
        ...(Object.keys(docRange).length ? { uploadedAt: docRange } : {}),
      }),
      DocumentModel.countDocuments({ userId, blockchainStatus: 'CONFIRMED' }),
    ]);

  res.json({
    success: true,
    message: 'Analytics overview',
    data: {
      totalDocuments,
      totalVerifications,
      verificationSuccessRate:
        totalVerifications === 0 ? 0 : Math.round((verifiedVerifications / totalVerifications) * 1000) / 10,
      blockchainRegistrations,
      blockchainDocumentCount,
    },
  });
});

/**
 * GET /api/analytics/documents
 * Daily upload counts and file-type distribution (aggregated server-side).
 */
export const documentsAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseRange(req);

  const match: Record<string, unknown> = { userId };
  if (Object.keys(range).length) match.uploadedAt = range;

  const [daily, types] = await Promise.all([
    DocumentModel.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: dateKeyStage('uploadedAt'), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    DocumentModel.aggregate<{ _id: string; count: number; bytes: number }>([
      { $match: match },
      {
        $addFields: {
          ext: {
            $toUpper: {
              $ifNull: [
                { $arrayElemAt: [{ $split: [{ $arrayElemAt: [{ $split: ['$originalName', '.'] }, -1] }] }, 0] },
                'OTHER',
              ],
            },
          },
        },
      },
      {
        $group: {
          _id: '$ext',
          count: { $sum: 1 },
          bytes: { $sum: '$fileSize' },
        },
      },
    ]),
  ]);

  const from = (range.$gte as Date) ?? new Date(Date.now() - 30 * 864e5);
  const to = (range.$lte as Date) ?? new Date();

  // Normalise extensions into the buckets shown on the chart.
  const KNOWN = ['PDF', 'DOC', 'DOCX', 'PNG', 'JPG', 'JPEG'];
  const typeMap = new Map<string, number>();
  let other = 0;
  for (const t of types) {
    if (!KNOWN.includes(t._id)) {
      other += t.count;
    } else if (t._id === 'JPG') {
      typeMap.set('JPG', (typeMap.get('JPG') ?? 0) + t.count);
    } else {
      typeMap.set(t._id, t.count);
    }
  }
  if (other > 0) typeMap.set('OTHER', other);
  for (const k of KNOWN) if (!typeMap.has(k)) typeMap.set(k, 0);
  if (other > 0 || types.length === 0) typeMap.set('OTHER', typeMap.get('OTHER') ?? 0);

  res.json({
    success: true,
    message: 'Document analytics',
    data: {
      daily: buildDailyBuckets(daily, from, to, {}),
      byType: [...typeMap.entries()]
        .filter(([, count]) => count > 0)
        .map(([type, count]) => ({ type, count })),
    },
  });
});

/**
 * GET /api/analytics/verifications
 * Daily verification volume plus result distribution.
 */
export const verificationsAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseRange(req);
  const match: Record<string, unknown> = { userId };
  if (Object.keys(range).length) match.verifiedAt = range;

  const [results, daily] = await Promise.all([
    Verification.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$result', count: { $sum: 1 } } },
    ]),
    Verification.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: dateKeyStage('verifiedAt'), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const dist = { VERIFIED: 0, MODIFIED: 0, NOT_FOUND: 0 };
  for (const r of results) {
    if (r._id in dist) dist[r._id as keyof typeof dist] = r.count;
  }

  const from = (range.$gte as Date) ?? new Date(Date.now() - 30 * 864e5);
  const to = (range.$lte as Date) ?? new Date();

  res.json({
    success: true,
    message: 'Verification analytics',
    data: {
      results: [
        { name: 'Verified', value: dist.VERIFIED },
        { name: 'Invalid', value: dist.MODIFIED },
        { name: 'Not Found', value: dist.NOT_FOUND },
      ],
      daily: buildDailyBuckets(daily, from, to, {}),
    },
  });
});

/**
 * GET /api/analytics/blockchain
 * Registration activity per day with confirmed/failed/pending breakdown.
 */
export const blockchainAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const range = parseRange(req);
  const match: Record<string, unknown> = { userId };
  if (Object.keys(range).length) match.uploadedAt = range;

  const daily = await DocumentModel.aggregate<{
    _id: string;
    count: number;
    confirmed: number;
    failed: number;
    pending: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: dateKeyStage('uploadedAt'),
        count: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'CONFIRMED'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'FAILED'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'PENDING'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalsRow = await DocumentModel.aggregate<{
    confirmed: number;
    failed: number;
    pending: number;
  }>([{ $match: { userId } }, { $group: { _id: null, ...{
    confirmed: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'CONFIRMED'] }, 1, 0] } },
    failed: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'FAILED'] }, 1, 0] } },
    pending: { $sum: { $cond: [{ $eq: ['$blockchainStatus', 'PENDING'] }, 1, 0] } },
  } } }]);

  const from = (range.$gte as Date) ?? new Date(Date.now() - 30 * 864e5);
  const to = (range.$lte as Date) ?? new Date();

  res.json({
    success: true,
    message: 'Blockchain analytics',
    data: {
      daily: buildDailyBuckets(
        daily,
        from,
        to,
        { confirmed: 0, failed: 0, pending: 0 }
      ).map(({ date, count, confirmed, failed, pending }) => ({ date, transactions: count, confirmed, failed, pending })),
      totals: totalsRow[0]
        ? { confirmed: totalsRow[0].confirmed, failed: totalsRow[0].failed, pending: totalsRow[0].pending }
        : { confirmed: 0, failed: 0, pending: 0 },
    },
  });
});

/**
 * GET /api/analytics/export
 * CSV report of the current user's real document records.
 */
export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const docs = await DocumentModel.find({ userId })
    .sort({ uploadedAt: -1 })
    .limit(5000)
    .lean();

  const header = [
    'document_name',
    'sha256_hash',
    'file_size_bytes',
    'mime_type',
    'blockchain_status',
    'verification_status',
    'transaction_hash',
    'block_number',
    'contract_address',
    'uploaded_at',
  ].join(',');

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = docs.map((d) =>
    [
      escape(d.originalName),
      escape(d.sha256Hash),
      d.fileSize,
      escape(d.mimeType),
      escape(d.blockchainStatus),
      escape(d.verificationStatus),
      escape(d.transactionHash),
      d.blockNumber ?? '',
      escape(d.contractAddress),
      escape(d.uploadedAt?.toISOString()),
    ].join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="blockvault-report-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header, ...lines].join('\n'));
});
