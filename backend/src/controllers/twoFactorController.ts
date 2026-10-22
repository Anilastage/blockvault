import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';
import {
  createTotpSecret,
  createTotpUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  findRecoveryCodeIndex,
} from '../services/twoFactorService';
import { createOtp, verifyOtp, rateLimitRemaining } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
import { sendOtpSms } from '../services/smsService';

const RECOVERY_CODES_COUNT = 10;
const MFA_TOKEN_TTL = '5m';

/**
 * POST /api/auth/2fa/setup
 * Stage a new TOTP secret + recovery codes. The secret becomes active only
 * after /2fa/verify confirms the user can generate codes from it.
 */
export const start2FASetup = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.twoFactorEnabled) {
    throw ApiError.conflict('Two-factor authentication is already enabled.');
  }

  const secret = createTotpSecret();
  const otpauthUrl = createTotpUri(user.email, secret);
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODES_COUNT);

  user.twoFactorSecret = secret;
  user.twoFactorPendingSetup = true;
  user.twoFactorRecoveryCodes = recoveryCodes.map(hashRecoveryCode);
  await user.save();

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  res.json({
    success: true,
    message: 'Scan the QR code with your authenticator app, save your recovery codes, then confirm a code to finish.',
    data: { otpauthUrl, secret, label: user.email, qrDataUrl, recoveryCodes },
  });
});

/** POST /api/auth/2fa/verify — confirm setup with a generated code. */
export const verify2FASetup = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };

  const user = await User.findById(req.user!.id).select(
    '+twoFactorSecret +twoFactorRecoveryCodes +twoFactorPendingSetup'
  );
  if (!user) throw ApiError.notFound('User not found');
  if (user.twoFactorEnabled) {
    throw ApiError.conflict('Two-factor authentication is already enabled.');
  }
  if (!user.twoFactorSecret || !user.twoFactorPendingSetup) {
    throw ApiError.badRequest('Start the setup flow first.');
  }
  if (!(await verifyTotp(token, user.twoFactorSecret))) {
    throw ApiError.badRequest('Invalid code. Make sure your device clock is accurate and try again.');
  }

  user.twoFactorEnabled = true;
  user.twoFactorPendingSetup = false;
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: '2FA_ENABLED',
    entityType: 'USER',
    entityId: String(user._id),
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Two-factor authentication is now enabled.',
    data: { enabled: true },
  });
});

/** POST /api/auth/2fa/disable — requires a valid code for the active method. */
export const disable2FA = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };

  const user = await User.findById(req.user!.id).select(
    '+twoFactorSecret +twoFactorRecoveryCodes +twoFactorPendingSetup +mfaMethod'
  );
  if (!user) throw ApiError.notFound('User not found');
  if (!user.twoFactorEnabled) {
    throw ApiError.badRequest('Two-factor authentication is not enabled.');
  }

  const method = user.mfaMethod ?? 'totp';
  let valid = false;

  if (method === 'totp') {
    const recoveryHashes = user.twoFactorRecoveryCodes ?? [];
    const cleanCode = token.trim().toUpperCase();
    const matchedRecovery = findRecoveryCodeIndex(cleanCode, recoveryHashes);
    if (matchedRecovery !== -1) {
      recoveryHashes.splice(matchedRecovery, 1);
      user.twoFactorRecoveryCodes = recoveryHashes;
      valid = true;
    } else if (user.twoFactorSecret) {
      valid = await verifyTotp(token, user.twoFactorSecret);
    }
  } else if (method === 'email_otp') {
    valid = await verifyOtp(String(user._id), token, 'mfa_setup', 'email');
    if (!valid) valid = await verifyOtp(String(user._id), token, 'mfa_login', 'email');
  } else if (method === 'sms_otp') {
    valid = await verifyOtp(String(user._id), token, 'mfa_setup', 'sms');
    if (!valid) valid = await verifyOtp(String(user._id), token, 'mfa_login', 'sms');
  }

  if (!valid) {
    throw ApiError.badRequest('Invalid authentication code.');
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorRecoveryCodes = undefined;
  user.twoFactorPendingSetup = false;
  user.mfaMethod = undefined;
  user.phoneNumber = undefined;
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: '2FA_DISABLED',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { method },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({ success: true, message: 'Two-factor authentication has been disabled.', data: {} });
});

/** POST /api/auth/2fa/recovery — rotate recovery codes (requires a TOTP code). */
export const regenerateRecoveryCodes = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };

  const user = await User.findById(req.user!.id).select(
    '+twoFactorSecret +twoFactorRecoveryCodes +twoFactorPendingSetup'
  );
  if (!user) throw ApiError.notFound('User not found');
  if (!user.twoFactorEnabled) {
    throw ApiError.badRequest('Two-factor authentication is not enabled.');
  }
  if (!user.twoFactorSecret || !(await verifyTotp(token, user.twoFactorSecret))) {
    throw ApiError.badRequest('Invalid authentication code.');
  }

  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODES_COUNT);
  user.twoFactorRecoveryCodes = recoveryCodes.map(hashRecoveryCode);
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: '2FA_RECOVERY_ROTATED',
    entityType: 'USER',
    entityId: String(user._id),
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'New recovery codes generated. Save them somewhere safe — they are shown only once.',
    data: { recoveryCodes },
  });
});

/**
 * POST /api/auth/2fa/email/setup
 * Send an OTP to the user's email to confirm they want to enable Email OTP
 * as their MFA method. No state is changed until verification.
 */
export const startEmailOtpSetup = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  const remaining = await rateLimitRemaining(String(user._id), 'mfa_setup', 'email');
  if (remaining > 0) {
    throw ApiError.tooManyRequests(
      `Please wait ${Math.ceil(remaining / 1000)}s before requesting another code.`
    );
  }

  const code = await createOtp(String(user._id), 'mfa_setup', 'email');
  const delivered = await sendOtpEmail(user.email, code);

  res.json({
    success: true,
    message: 'A verification code has been sent to your email.',
    data: { devCode: delivered ? undefined : code },
  });
});

/** POST /api/auth/2fa/email/verify — verify the emailed code and enable Email OTP. */
export const verifyEmailOtpSetup = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body as { code: string };
  const userId = String(req.user!.id);

  const ok = await verifyOtp(userId, code, 'mfa_setup', 'email');
  if (!ok) throw ApiError.badRequest('Invalid or expired verification code.');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.twoFactorEnabled = true;
  user.mfaMethod = 'email_otp';
  user.twoFactorPendingSetup = false;
  user.twoFactorSecret = undefined;
  user.twoFactorRecoveryCodes = undefined;
  await user.save();

  await logActivity({
    userId,
    action: '2FA_ENABLED',
    entityType: 'USER',
    entityId: userId,
    metadata: { method: 'email_otp' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Email two-factor authentication is now enabled.',
    data: { enabled: true, mfaMethod: 'email_otp' },
  });
});

/**
 * POST /api/auth/2fa/sms/setup
 * Require a phone number, then send an OTP via SMS to confirm enabling SMS OTP.
 */
export const startSmsOtpSetup = asyncHandler(async (req: Request, res: Response) => {
  const { phoneNumber } = req.body as { phoneNumber: string };
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  const remaining = await rateLimitRemaining(String(user._id), 'mfa_setup', 'sms');
  if (remaining > 0) {
    throw ApiError.tooManyRequests(
      `Please wait ${Math.ceil(remaining / 1000)}s before requesting another code.`
    );
  }

  const code = await createOtp(String(user._id), 'mfa_setup', 'sms');
  await sendOtpSms(phoneNumber, code);

  res.json({
    success: true,
    message: 'A verification code has been sent to your phone.',
    data: {},
  });
});

/** POST /api/auth/2fa/sms/verify — verify the SMS code and enable SMS OTP. */
export const verifySmsOtpSetup = asyncHandler(async (req: Request, res: Response) => {
  const { code, phoneNumber } = req.body as { code: string; phoneNumber?: string };
  const userId = String(req.user!.id);

  const ok = await verifyOtp(userId, code, 'mfa_setup', 'sms');
  if (!ok) throw ApiError.badRequest('Invalid or expired verification code.');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  user.twoFactorEnabled = true;
  user.mfaMethod = 'sms_otp';
  user.twoFactorPendingSetup = false;
  user.twoFactorSecret = undefined;
  user.twoFactorRecoveryCodes = undefined;
  if (phoneNumber) user.phoneNumber = phoneNumber;
  await user.save();

  await logActivity({
    userId,
    action: '2FA_ENABLED',
    entityType: 'USER',
    entityId: userId,
    metadata: { method: 'sms_otp' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'SMS two-factor authentication is now enabled.',
    data: { enabled: true, mfaMethod: 'sms_otp' },
  });
});

/**
 * POST /api/auth/2fa/login
 * Second step of a two-factor login. Verifies the code for the user's active
 * MFA method (TOTP/recovery, email OTP, or SMS OTP) and issues the session.
 */
export const verifyLoginTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const { mfaToken, code } = req.body as { mfaToken: string; code: string };

  let decoded: { id: string; type?: string };
  try {
    decoded = jwt.verify(mfaToken, env.jwtSecret, { algorithms: ['HS256'] }) as {
      id: string;
      type?: string;
    };
  } catch {
    throw ApiError.unauthorized('Your two-factor session has expired. Please sign in again.');
  }
  if (decoded.type !== 'mfa' || !decoded.id) {
    throw ApiError.unauthorized('Invalid two-factor session.');
  }

  const user = await User.findById(decoded.id).select('+mfaMethod +twoFactorEnabled');
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('This account could not be authenticated.');
  }

  // Login is always gated behind a mandatory email OTP. Verify the code that
  // was delivered at the login step.
  const valid = await verifyOtp(String(user._id), code, 'mfa_login', 'email');
  if (!valid) {
    throw ApiError.unauthorized('Invalid authentication code.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ id: String(user._id), role: user.role, email: user.email });

  await logActivity({
    userId: String(user._id),
    action: 'LOGIN',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: {
      mfa: true,
      method: 'email_otp',
    },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Logged in successfully',
    data: {
      token,
      user: {
        id: String(user._id),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress ?? '',
        profileImage: user.profileImage ?? '',
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        twoFactorEnabled: user.twoFactorEnabled,
        mfaMethod: user.mfaMethod,
      },
    },
  });
});