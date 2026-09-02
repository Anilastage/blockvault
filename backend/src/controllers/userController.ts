import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import { DocumentModel } from '../models/Document';
import { Verification } from '../models/Verification';
import { ActivityLog } from '../models/ActivityLog';
import { UserSettings } from '../models/UserSettings';
import { DownloadCode } from '../models/DownloadCode';
import { AccessRequest } from '../models/AccessRequest';
import { DownloadRecord } from '../models/DownloadRecord';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';
import { storageProvider } from '../services/storageService';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({
    success: true,
    message: 'Profile retrieved',
    data: { user },
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, walletAddress } = req.body as {
    fullName?: string;
    walletAddress?: string;
  };

  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  if (fullName !== undefined) user.fullName = fullName;
  if (walletAddress !== undefined) {
    user.walletAddress = walletAddress === '' ? undefined : walletAddress.toLowerCase();
  }

  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'PROFILE_UPDATE',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { fullName: user.fullName, walletAddress: user.walletAddress ?? '' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user },
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    throw ApiError.badRequest(
      'Current password and a new password of at least 8 characters are required.'
    );
  }

  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'PASSWORD_CHANGE',
    entityType: 'USER',
    entityId: String(user._id),
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({ success: true, message: 'Password changed successfully', data: {} });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    throw ApiError.badRequest('Password confirmation is required to delete your account.');
  }

  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Incorrect password');

  // Remove the user's stored files and records. On-chain registrations are
  // permanent by design and are intentionally left untouched.
  const docs = await DocumentModel.find({ userId: user._id }).select('storagePath');
  const docIds = docs.map((d) => d._id);
  for (const doc of docs) {
    await storageProvider.delete(doc.storagePath);
  }
  await Promise.all([
    DocumentModel.deleteMany({ userId: user._id }),
    Verification.deleteMany({ userId: user._id }),
    ActivityLog.deleteMany({ userId: user._id }),
    UserSettings.deleteMany({ userId: user._id }),
    // Access requests where this user was the requester.
    AccessRequest.deleteMany({ requesterId: user._id }),
    // Download codes, access requests and download audit rows tied to this
    // user's documents.
    DownloadCode.deleteMany({ documentId: { $in: docIds } }),
    AccessRequest.deleteMany({ documentId: { $in: docIds } }),
    DownloadRecord.deleteMany({ documentId: { $in: docIds } }),
    DownloadRecord.deleteMany({ requesterId: user._id }),
  ]);

  await logActivity({
    action: 'ACCOUNT_DELETED',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { email: user.email },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  await User.deleteOne({ _id: user._id });

  res.json({
    success: true,
    message:
      'Account deleted. Local documents were removed; blockchain registrations remain on-chain.',
    data: {},
  });
});
