import type { Request, Response } from 'express';
import { Notification } from '../models/Notification';
import { asyncHandler } from '../middleware/errorHandler';
import { subscribeStream } from '../services/notificationService';
import { ApiError } from '../utils/ApiError';

/** GET /api/notifications/stream (SSE) — live event stream. */
export const streamNotifications = asyncHandler(async (req: Request, res: Response) => {
  subscribeStream(String(req.user!.id), res);
});

/** GET /api/notifications — paginated, newest first. */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 15)));
  const unreadOnly = req.query.unread === 'true';

  const filter: { userId: string; read?: boolean } = { userId: String(req.user!.id) };
  if (unreadOnly) filter.read = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Notifications retrieved',
    data: {
      notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

/** GET /api/notifications/unread-count */
export const getUnreadCount = asyncHandler(async (_req: Request, res: Response) => {
  const count = await Notification.countDocuments({
    userId: _req.user!.id,
    read: false,
  });
  res.json({ success: true, message: 'Unread notification count', data: { count } });
});

/** PATCH /api/notifications/:id/read */
export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.id },
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw ApiError.notFound('Notification not found');
  res.json({ success: true, message: 'Notification marked as read', data: { notification } });
});

/** POST /api/notifications/read-all */
export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const { modifiedCount } = await Notification.updateMany(
    { userId: req.user!.id, read: false },
    { read: true, readAt: new Date() }
  );
  res.json({
    success: true,
    message: 'All notifications marked as read',
    data: { marked: modifiedCount },
  });
});