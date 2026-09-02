import { Router } from 'express';
import { protect, protectStream } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { mongoIdParam } from '../validators';
import {
  streamNotifications,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
} from '../controllers/notificationController';

const router = Router();

router.get('/stream', protectStream, streamNotifications);

router.use(protect);

router.get(
  '/',
  validate(
    z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      unread: z.enum(['true', 'false']).optional(),
    }),
    'query'
  ),
  getNotifications
);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', validate(mongoIdParam, 'params'), markNotificationRead);
router.post('/read-all', markAllRead);

export default router;