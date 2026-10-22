import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  getProfile,
  updateProfile,
  getEncryption,
  setupEncryption,
  updateRecoveryEnvelope,
  changePassword,
  deleteAccount,
  getWalletLinkMessage,
  linkWallet,
  unlinkWallet,
} from '../controllers/userController';
import { getSettings, patchSettings, settingsPatchSchema } from '../controllers/settingsController';
import { validate } from '../middleware/validate';
import {
  updateProfileSchema,
  vaultSetupSchema,
  vaultRecoveryEnvelopeSchema,
  walletLinkMessageSchema,
  walletLinkSchema,
  walletUnlinkSchema,
} from '../validators';
import { protect } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';

const router = Router();

router.use(protect);

const rejectProfileWalletChange: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object' && 'walletAddress' in req.body) {
    next(
      ApiError.badRequest(
        'The wallet address cannot be changed here. Use POST /api/users/wallet/link so ownership is proven with a signature.'
      )
    );
    return;
  }
  next();
};

router.get('/profile', getProfile);
router.put(
  '/profile',
  rejectProfileWalletChange,
  validate(updateProfileSchema),
  updateProfile
);
router.get('/encryption', getEncryption);
router.post('/encryption', validate(vaultSetupSchema), setupEncryption);
router.put(
  '/encryption/recovery',
  validate(vaultRecoveryEnvelopeSchema),
  updateRecoveryEnvelope
);
router.get(
  '/wallet/link-message',
  validate(walletLinkMessageSchema, 'query', 400),
  getWalletLinkMessage
);
router.post('/wallet/link', validate(walletLinkSchema, 'body', 400), linkWallet);
router.post('/wallet/unlink', validate(walletUnlinkSchema, 'body', 400), unlinkWallet);
router.put(
  '/password',
  validate(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(72)
        .regex(/[A-Za-z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
      vault: z
        .object({
          passwordWrappedVaultKey: z.string().min(8).max(8192),
          passwordWrapIv: z.string().min(8).max(8192),
          keySalt: z.string().min(8).max(8192),
          keyIterations: z.number().int().min(100_000).max(2_000_000),
        })
        .optional(),
    })
  ),
  changePassword
);
router.delete(
  '/account',
  validate(z.object({ password: z.string().min(1) })),
  deleteAccount
);

router.get('/settings', getSettings);
router.patch('/settings', validate(settingsPatchSchema), patchSettings);

export default router;
