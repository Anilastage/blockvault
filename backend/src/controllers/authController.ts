import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';
import { createOtp, verifyOtp, rateLimitRemaining } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
import { sendOtpSms } from '../services/smsService';

const VERIFY_TOKEN_TTL = '10m';
const RECOVERY_TOKEN_TTL = '10m';
const ENCRYPTION_SELECT =
  '+encryption.encryptedPrivateKey +encryption.privateKeyIv ' +
  '+encryption.passwordWrappedVaultKey +encryption.passwordWrapIv ' +
  '+encryption.recoveryWrappedVaultKey +encryption.recoveryWrapIv ' +
  '+encryption.keySalt +encryption.keyIterations';

const publicUser = (user: {
  _id: unknown;
  fullName: string;
  email: string;
  role: string;
  walletAddress?: string;
  profileImage?: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt?: Date;
  lastLoginAt?: Date;
  twoFactorEnabled: boolean;
  mfaMethod?: 'totp' | 'email_otp' | 'sms_otp';
  phoneNumber?: string;
}) => ({
  id: String(user._id),
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  walletAddress: user.walletAddress ?? '',
  profileImage: user.profileImage ?? '',
  isActive: user.isActive,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  twoFactorEnabled: user.twoFactorEnabled,
  mfaMethod: user.mfaMethod,
  phoneNumber: user.phoneNumber,
});

/**
 * Sign a short-lived "verify your email" ticket. It is NOT a session token —
 * it only proves the email verification and MFA steps later.
 */
const signVerifyToken = (payload: { id: string; role: string; email: string }) =>
  jwt.sign(
    { id: payload.id, role: payload.role, email: payload.email, type: 'verify_email' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: VERIFY_TOKEN_TTL } as jwt.SignOptions
  );

/** Surface the plaintext OTP on-screen only when email could not be delivered. */
const devCodeFor = (code: string, delivered: boolean): string | undefined =>
  !delivered || env.isTest ? code : undefined;

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email, password } = req.body as {
    fullName: string;
    email: string;
    password: string;
  };

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const isFirstUser = (await User.countDocuments({})) === 0;

  const user = await User.create({
    fullName,
    email,
    passwordHash,
    role: isFirstUser ? 'ADMIN' : 'USER',
    emailVerified: false,
    lastLoginAt: new Date(),
  });

  // Mandatory email verification: create the account but do NOT issue a session
  // until the user proves ownership of the email address with the OTP below.
  const code = await createOtp(String(user._id), 'email_verify', 'email');
  const delivered = await sendOtpEmail(user.email, code);

  const verifyToken = signVerifyToken({
    id: String(user._id),
    role: user.role,
    email: user.email,
  });

  await logActivity({
    userId: String(user._id),
    action: 'REGISTER',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { email },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.status(201).json({
    success: true,
    message: 'Account created. Please verify your email to continue.',
    data: {
      requiresEmailVerification: true,
      mfaToken: verifyToken,
      method: 'email_verify',
      devCode: devCodeFor(code, delivered),
      user: publicUser(user),
    },
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { mfaToken, code } = req.body as { mfaToken: string; code: string };

  let decoded: { id: string; type?: string };
  try {
    decoded = jwt.verify(mfaToken, env.jwtSecret, { algorithms: ['HS256'] }) as {
      id: string;
      type?: string;
    };
  } catch {
    throw ApiError.unauthorized('Your verification session has expired. Please sign in again.');
  }
  if (decoded.type !== 'verify_email' || !decoded.id) {
    throw ApiError.unauthorized('Invalid verification session.');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('This account could not be authenticated.');
  }

  const valid = await verifyOtp(String(user._id), code, 'email_verify', 'email');
  if (!valid) {
    throw ApiError.unauthorized('Invalid verification code.');
  }

  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ id: String(user._id), role: user.role, email: user.email });

  await logActivity({
    userId: String(user._id),
    action: 'LOGIN',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { method: 'email_verify' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Email verified successfully',
    data: {
      token,
      user: publicUser(user),
    },
  });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const { mfaToken } = req.body as { mfaToken: string };

  let decoded: { id: string; type?: string };
  try {
    decoded = jwt.verify(mfaToken, env.jwtSecret, { algorithms: ['HS256'] }) as {
      id: string;
      type?: string;
    };
  } catch {
    throw ApiError.unauthorized('Your verification session has expired. Please sign in again.');
  }
  if (decoded.type !== 'verify_email' || !decoded.id) {
    throw ApiError.unauthorized('Invalid verification session.');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('This account could not be authenticated.');
  }

  const remaining = await rateLimitRemaining(String(user._id), 'email_verify', 'email');
  if (remaining > 0) {
    throw ApiError.tooManyRequests(
      `Please wait ${Math.ceil(remaining / 1000)}s before requesting another code.`
    );
  }

  const code = await createOtp(String(user._id), 'email_verify', 'email');
  const delivered = await sendOtpEmail(user.email, code);

  res.json({
    success: true,
    message: 'A fresh verification code was sent.',
    data: { devCode: devCodeFor(code, delivered) },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email }).select(
    '+passwordHash +mfaMethod +phoneNumber +emailVerified'
  );
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been disabled. Contact an administrator.');
  }

  // Gate 1 of 2: the account's email must be verified. Legacy accounts (created
  // before email verification existed) re-enter this path once until verified.
  if (!user.emailVerified) {
    const code = await createOtp(String(user._id), 'email_verify', 'email');
    const delivered = await sendOtpEmail(user.email, code);
    return res.json({
      success: true,
      message: 'Please verify your email address to continue.',
      data: {
        requiresEmailVerification: true,
        mfaToken: signVerifyToken({
          id: String(user._id),
          role: user.role,
          email: user.email,
        }),
        method: 'email_verify',
        devCode: devCodeFor(code, delivered),
        user: publicUser(user),
      },
    });
  }

  // Step 2 of two-factor login: every login is gated behind an email OTP
  // challenge, regardless of whether the user has individually enabled 2FA.
  // This makes email OTP mandatory for all accounts.
  const code = await createOtp(String(user._id), 'mfa_login', 'email');
  const delivered = await sendOtpEmail(user.email, code);

  const mfaToken = jwt.sign(
    { id: String(user._id), role: user.role, email: user.email, type: 'mfa' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' } as jwt.SignOptions
  );
  return res.json({
    success: true,
    message: 'Two-factor verification required.',
    data: {
      requiresTwoFactor: true,
      mfaToken,
      method: 'email_otp',
      // Dev/test fallback: when email cannot be delivered, surface the code
      // directly to keep login usable. Omitted once Resend/SMTP is working.
      devCode: devCodeFor(code, delivered),
      user: publicUser(user),
    },
  });
});

/**
 * POST /api/auth/recover/start
 * Sends an email OTP and returns the recovery-key envelope. The server never
 * sees the recovery phrase or the vault key; the client proves possession by
 * successfully decrypting the envelope locally.
 */
export const startVaultRecovery = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };

  const user = await User.findOne({ email }).select(`+emailVerified ${ENCRYPTION_SELECT}`);
  if (!user || !user.isActive) {
    throw ApiError.notFound('No active account was found for this email.');
  }

  const hasVault = !!user.encryption?.publicKey;
  if (
    hasVault &&
    (!user.encryption?.recoveryWrappedVaultKey || !user.encryption?.recoveryWrapIv)
  ) {
    throw ApiError.badRequest(
      'This account has an encryption vault but no recovery key, so the password cannot be reset safely.'
    );
  }

  const remaining = await rateLimitRemaining(String(user._id), 'vault_recovery', 'email');
  if (remaining > 0) {
    throw ApiError.tooManyRequests(
      `Please wait ${Math.ceil(remaining / 1000)}s before requesting another code.`
    );
  }

  const code = await createOtp(String(user._id), 'vault_recovery', 'email');
  const delivered = await sendOtpEmail(user.email, code);

  const recoveryToken = jwt.sign(
    { id: String(user._id), type: 'vault_recovery' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: RECOVERY_TOKEN_TTL } as jwt.SignOptions
  );

  res.json({
    success: true,
    message: 'Recovery code sent to your email.',
    data: {
      recoveryToken,
      email: user.email,
      hasVault,
      recoveryWrappedVaultKey: user.encryption?.recoveryWrappedVaultKey,
      recoveryWrapIv: user.encryption?.recoveryWrapIv,
      devCode: devCodeFor(code, delivered),
    },
  });
});

/**
 * POST /api/auth/recover/complete
 * Verifies the OTP and installs a new password + password-wrapped vault key.
 * The recovery envelope must be unchanged, so a valid recovery phrase remains
 * valid after the reset.
 */
export const completeVaultRecovery = asyncHandler(async (req: Request, res: Response) => {
  const {
    recoveryToken,
    code,
    newPassword,
    passwordWrappedVaultKey,
    passwordWrapIv,
    keySalt,
    keyIterations,
    recoveryWrappedVaultKey,
    recoveryWrapIv,
  } = req.body as {
    recoveryToken: string;
    code: string;
    newPassword: string;
    passwordWrappedVaultKey?: string;
    passwordWrapIv?: string;
    keySalt?: string;
    keyIterations?: number;
    recoveryWrappedVaultKey?: string;
    recoveryWrapIv?: string;
  };

  let decoded: { id: string; type?: string };
  try {
    decoded = jwt.verify(recoveryToken, env.jwtSecret, { algorithms: ['HS256'] }) as {
      id: string;
      type?: string;
    };
  } catch {
    throw ApiError.unauthorized('Your recovery session has expired. Start again.');
  }
  if (decoded.type !== 'vault_recovery' || !decoded.id) {
    throw ApiError.unauthorized('Invalid recovery session.');
  }

  const user = await User.findById(decoded.id).select(`+passwordHash ${ENCRYPTION_SELECT}`);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('This account could not be authenticated.');
  }
  // Accounts without an encryption vault can reset their password with the
  // emailed code alone. Accounts with a vault must prove possession of the
  // recovery phrase so the vault key can be re-wrapped for the new password.
  const hasVault = !!user.encryption?.publicKey;
  if (hasVault) {
    if (!user.encryption?.recoveryWrappedVaultKey) {
      throw ApiError.badRequest('This account does not have an encryption recovery key set up.');
    }
    if (
      recoveryWrappedVaultKey !== user.encryption.recoveryWrappedVaultKey ||
      recoveryWrapIv !== user.encryption.recoveryWrapIv
    ) {
      throw ApiError.badRequest('The recovery key no longer matches this vault.');
    }
    if (!passwordWrappedVaultKey || !passwordWrapIv || !keySalt || !keyIterations) {
      throw ApiError.badRequest(
        'The encryption vault must be re-wrapped with your new password. Enter your recovery phrase.'
      );
    }
  }

  const valid = await verifyOtp(String(user._id), code, 'vault_recovery', 'email');
  if (!valid) {
    throw ApiError.unauthorized('Invalid recovery code.');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  if (hasVault && user.encryption) {
    user.encryption.passwordWrappedVaultKey = passwordWrappedVaultKey;
    user.encryption.passwordWrapIv = passwordWrapIv;
    user.encryption.keySalt = keySalt;
    user.encryption.keyIterations = keyIterations;
  }
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'VAULT_RECOVERED',
    entityType: 'USER',
    entityId: String(user._id),
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Password reset. Sign in with your new password.',
    data: {},
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, message: 'Profile retrieved', data: { user: publicUser(user) } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await logActivity({
    userId: req.user?.id ? String(req.user.id) : undefined,
    action: 'LOGOUT',
    entityType: 'USER',
    entityId: req.user?.id ? String(req.user.id) : undefined,
    ...clientMeta(req.ip, req.headers['user-agent']),
  });
  res.json({ success: true, message: 'Logged out successfully', data: {} });
});
