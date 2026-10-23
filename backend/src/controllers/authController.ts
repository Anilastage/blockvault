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
import { sendOtpEmail, isEmailConfigured } from '../services/emailService';
import { sendOtpSms } from '../services/smsService';

const VERIFY_TOKEN_TTL = '10m';

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

/** Surface the plaintext OTP on-screen only when email cannot be delivered (dev/test). */
const devCodeFor = (code: string): string | undefined =>
  !isEmailConfigured() || env.isTest ? code : undefined;

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
  await sendOtpEmail(user.email, code);

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
      devCode: devCodeFor(code),
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
  await sendOtpEmail(user.email, code);

  res.json({
    success: true,
    message: 'A fresh verification code was sent.',
    data: { devCode: devCodeFor(code) },
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
    await sendOtpEmail(user.email, code);
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
        devCode: devCodeFor(code),
        user: publicUser(user),
      },
    });
  }

  // Step 2 of two-factor login: every login is gated behind an email OTP
  // challenge, regardless of whether the user has individually enabled 2FA.
  // This makes email OTP mandatory for all accounts.
  const code = await createOtp(String(user._id), 'mfa_login', 'email');
  await sendOtpEmail(user.email, code);

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
      // Dev/test fallback: when SMTP is not configured the OTP cannot be
      // delivered, so surface the code directly to keep login usable. This is
      // omitted once real SMTP credentials are set (deployed), where the code
      // is only emailed. In automated tests the code is always surfaced so the
      // suite does not depend on external email delivery.
      devCode: !isEmailConfigured() || env.isTest ? code : undefined,
      user: publicUser(user),
    },
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
