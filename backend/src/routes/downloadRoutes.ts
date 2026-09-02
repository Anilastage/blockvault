import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { downloadLimiter } from '../middleware/rateLimiter';
import { protect } from '../middleware/auth';
import { downloadByCode } from '../controllers/downloadCodeController';

const router = Router();

/**
 * Authenticated — the recipient must be signed in to download via a share
 * code. This guarantees every download is attributed by name in the audit
 * trail. The code itself is still sensitive, so the endpoint is rate-limited.
 */
router.post(
  '/code',
  protect,
  downloadLimiter,
  validate(
    z.object({
      code: z.string().trim().min(6, 'A download code is required'),
    })
  ),
  downloadByCode
);

export default router;
