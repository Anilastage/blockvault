import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import { DocumentModel } from '../models/Document';
import { FolderModel } from '../models/Folder';
import { Verification } from '../models/Verification';
import { ActivityLog } from '../models/ActivityLog';
import { UserSettings } from '../models/UserSettings';
import { DownloadCode } from '../models/DownloadCode';
import { AccessRequest } from '../models/AccessRequest';
import { DownloadRecord } from '../models/DownloadRecord';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity, clientMeta } from '../services/activityService';
import { createLinkMessage, assertValidLinkSignature } from '../services/walletLinkService';
import { storageProvider } from '../services/storageService';

const ENCRYPTION_SELECT =
  '+encryption.encryptedPrivateKey +encryption.privateKeyIv ' +
  '+encryption.passwordWrappedVaultKey +encryption.passwordWrapIv ' +
  '+encryption.recoveryWrappedVaultKey +encryption.recoveryWrapIv ' +
  '+encryption.keySalt +encryption.keyIterations';

const encryptionPayload = (user: {
  encryption?: {
    version: number;
    publicKey?: string;
    encryptedPrivateKey?: string;
    privateKeyIv?: string;
    passwordWrappedVaultKey?: string;
    passwordWrapIv?: string;
    recoveryWrappedVaultKey?: string;
    recoveryWrapIv?: string;
    keySalt?: string;
    keyIterations?: number;
  };
}) => {
  const encryption = user.encryption;
  if (!encryption?.publicKey || !encryption.passwordWrappedVaultKey) return null;
  return {
    version: encryption.version,
    publicKey: encryption.publicKey,
    encryptedPrivateKey: encryption.encryptedPrivateKey,
    privateKeyIv: encryption.privateKeyIv,
    passwordWrappedVaultKey: encryption.passwordWrappedVaultKey,
    passwordWrapIv: encryption.passwordWrapIv,
    recoveryWrappedVaultKey: encryption.recoveryWrappedVaultKey,
    recoveryWrapIv: encryption.recoveryWrapIv,
    keySalt: encryption.keySalt,
    keyIterations: encryption.keyIterations,
  };
};

/** GET /api/users/encryption — wrapped vault material for the signed-in user. */
export const getEncryption = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select(ENCRYPTION_SELECT);
  if (!user) throw ApiError.notFound('User not found');
  res.json({
    success: true,
    message: 'Encryption identity retrieved',
    data: { encryption: encryptionPayload(user) },
  });
});

/** POST /api/users/encryption — initialize the vault exactly once. */
export const setupEncryption = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select(ENCRYPTION_SELECT);
  if (!user) throw ApiError.notFound('User not found');
  if (user.encryption?.publicKey) {
    throw ApiError.conflict('Your encryption vault is already initialized.');
  }

  user.encryption = {
    version: 1,
    publicKey: req.body.publicKey,
    encryptedPrivateKey: req.body.encryptedPrivateKey,
    privateKeyIv: req.body.privateKeyIv,
    passwordWrappedVaultKey: req.body.passwordWrappedVaultKey,
    passwordWrapIv: req.body.passwordWrapIv,
    recoveryWrappedVaultKey: req.body.recoveryWrappedVaultKey,
    recoveryWrapIv: req.body.recoveryWrapIv,
    keySalt: req.body.keySalt,
    keyIterations: req.body.keyIterations,
  };
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'VAULT_INITIALIZED',
    entityType: 'USER',
    entityId: String(user._id),
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.status(201).json({
    success: true,
    message: 'Encryption vault created',
    data: { encryption: encryptionPayload(user) },
  });
});

/** PUT /api/users/encryption/recovery — replace the recovery-key envelope. */
export const updateRecoveryEnvelope = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select(ENCRYPTION_SELECT);
  if (!user) throw ApiError.notFound('User not found');
  if (!user.encryption?.publicKey) {
    throw ApiError.badRequest('Set up your encryption vault first.');
  }

  user.encryption.recoveryWrappedVaultKey = req.body.recoveryWrappedVaultKey;
  user.encryption.recoveryWrapIv = req.body.recoveryWrapIv;
  await user.save();

  res.json({
    success: true,
    message: 'Recovery phrase updated',
    data: {},
  });
});

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
  const { fullName } = req.body as { fullName?: string };

  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  if (fullName !== undefined) user.fullName = fullName;

  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'PROFILE_UPDATE',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { fullName: user.fullName },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user },
  });
});

/**
 * GET /api/users/wallet/link-message?address=0x…
 * Issues the canonical message the wallet must sign to be linked. Nothing is
 * stored: the message carries its own issue time and nonce, and the signature
 * over it is what proves control.
 */
export const getWalletLinkMessage = asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.query as { address: string };
  res.json({
    success: true,
    message: 'Signing message created',
    data: { message: createLinkMessage(address) },
  });
});

/**
 * POST /api/users/wallet/link
 * Links a wallet to the signed-in account after verifying the signature.
 * Ownership proof is what allows a registration's on-chain owner (msg.sender)
 * to be tied back to this account.
 */
export const linkWallet = asyncHandler(async (req: Request, res: Response) => {
  const { address, message, signature } = req.body as {
    address: string;
    message: string;
    signature: string;
  };

  assertValidLinkSignature({ address, message, signature });

  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('User not found');

  const normalized = address.toLowerCase();
  const previous = user.walletAddress;
  user.walletAddress = normalized;
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'WALLET_LINKED',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { walletAddress: normalized, previousWalletAddress: previous ?? '' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Wallet linked to your account',
    data: { user },
  });
});

/** POST /api/users/wallet/unlink — requires the account password. */
export const unlinkWallet = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };

  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Incorrect password');

  const previous = user.walletAddress;
  user.walletAddress = undefined;
  await user.save();

  await logActivity({
    userId: String(user._id),
    action: 'WALLET_UNLINKED',
    entityType: 'USER',
    entityId: String(user._id),
    metadata: { walletAddress: previous ?? '' },
    ...clientMeta(req.ip, req.headers['user-agent']),
  });

  res.json({
    success: true,
    message: 'Wallet unlinked. On-chain registrations stay permanent.',
    data: { user },
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword, vault } = req.body as {
    currentPassword?: string;
    newPassword?: string;
    vault?: {
      passwordWrappedVaultKey: string;
      passwordWrapIv: string;
      keySalt: string;
      keyIterations: number;
    };
  };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    throw ApiError.badRequest(
      'Current password and a new password of at least 8 characters are required.'
    );
  }

  const user = await User.findById(req.user!.id).select(`+passwordHash ${ENCRYPTION_SELECT}`);
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  // Changing the login password must also re-wrap the vault key; otherwise
  // every encrypted document would become permanently unreachable.
  if (user.encryption?.publicKey) {
    if (!vault) {
      throw ApiError.badRequest(
        'The encryption vault must be re-wrapped when changing your password. Unlock your vault and try again.'
      );
    }
    user.encryption.passwordWrappedVaultKey = vault.passwordWrappedVaultKey;
    user.encryption.passwordWrapIv = vault.passwordWrapIv;
    user.encryption.keySalt = vault.keySalt;
    user.encryption.keyIterations = vault.keyIterations;
  }

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
    FolderModel.deleteMany({ userId: user._id }),
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
