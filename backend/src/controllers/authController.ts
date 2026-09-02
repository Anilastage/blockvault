import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';
import { createOtp } from '../services/otpService';
import { sendOtpEmail, isEmailConfigured } from '../services/emailService';
import { sendOtpSms } from '../services/smsService';

const publicUser = (user: {
  _id: unknown;
  fullName: string;
  email: string;
  role: string;
  walletAddress?: string;
  profileImage?: string;
  isActive: boolean;
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
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  twoFactorEnabled: user.twoFactorEnabled,
  mfaMethod: user.mfaMethod,
  phoneNumber: user.phoneNumber,
});

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
    lastLoginAt: new Date(),
  });

  const token = signToken({
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
    message: 'Account created successfully',
    data: {
      token,
      user: publicUser(user),
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email }).select('+passwordHash +mfaMethod +phoneNumber');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been disabled. Contact an administrator.');
  }

  // Step 1 of two-factor login: every login is gated behind an email OTP
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
