import { Router } from 'express';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import {
  requestAccess,
  getMyRequests,
  getIncomingRequests,
  approveRequest,
  denyRequest,
  downloadWithToken,
} from '../controllers/accessController';

const router = Router();

router.use(protect);

router.post(
  '/requests',
  validate(
    z.object({
      documentId: z.string().min(1, 'documentId is required'),
      reason: z.string().trim().max(500).optional(),
    })
  ),
  requestAccess
);

router.get(
  '/requests/mine',
  validate(
    z.object({
      status: z.enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'USED', 'ALL']).optional(),
      documentId: z.string().optional(),
    }),
    'query'
  ),
  getMyRequests
);

router.get(
  '/requests',
  validate(
    z.object({
      status: z
        .enum(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'USED', 'ALL'])
        .default('PENDING'),
    }),
    'query'
  ),
  getIncomingRequests
);

router.post(
  '/requests/:id/approve',
  validate(z.object({ id: z.string().length(24) }), 'params'),
  approveRequest
);

router.post(
  '/requests/:id/deny',
  validate(z.object({ id: z.string().length(24) }), 'params'),
  denyRequest
);

router.get('/requests/:token/download', downloadWithToken);

export default router;