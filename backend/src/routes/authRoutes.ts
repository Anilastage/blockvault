import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  getMe,
  logout,
  startVaultRecovery,
  completeVaultRecovery,
} from '../controllers/authController';
import {
  start2FASetup,
  verify2FASetup,
  disable2FA,
  regenerateRecoveryCodes,
  verifyLoginTwoFactor,
  startEmailOtpSetup,
  verifyEmailOtpSetup,
  startSmsOtpSetup,
  verifySmsOtpSetup,
} from '../controllers/twoFactorController';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  totpCodeSchema,
  mfaDisableSchema,
  loginTwoFactorSchema,
  otpCodeSchema,
  smsSetupSchema,
  recoverVaultStartSchema,
  recoverVaultCompleteSchema,
} from '../validators';
import { protect } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/recover/start', authLimiter, validate(recoverVaultStartSchema), startVaultRecovery);
router.post(
  '/recover/complete',
  authLimiter,
  validate(recoverVaultCompleteSchema),
  completeVaultRecovery
);
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', authLimiter, validate(resendVerificationSchema), resendVerification);
router.post('/2fa/login', authLimiter, validate(loginTwoFactorSchema), verifyLoginTwoFactor);
router.post('/2fa/setup', authLimiter, protect, start2FASetup);
router.post('/2fa/verify', authLimiter, protect, validate(totpCodeSchema), verify2FASetup);
router.post('/2fa/disable', authLimiter, protect, validate(mfaDisableSchema), disable2FA);
router.post('/2fa/recovery', authLimiter, protect, validate(totpCodeSchema), regenerateRecoveryCodes);
router.post('/2fa/email/setup', authLimiter, protect, startEmailOtpSetup);
router.post('/2fa/email/verify', authLimiter, protect, validate(otpCodeSchema), verifyEmailOtpSetup);
router.post('/2fa/sms/setup', authLimiter, protect, validate(smsSetupSchema), startSmsOtpSetup);
router.post('/2fa/sms/verify', authLimiter, protect, validate(otpCodeSchema), verifySmsOtpSetup);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export default router;
