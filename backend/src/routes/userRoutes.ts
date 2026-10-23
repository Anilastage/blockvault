import { Router } from 'express';
import { z } from 'zod';
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from '../controllers/userController';
import { getSettings, patchSettings, settingsPatchSchema } from '../controllers/settingsController';
import { validate } from '../middleware/validate';
import { updateProfileSchema } from '../validators';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', validate(updateProfileSchema), updateProfile);
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
