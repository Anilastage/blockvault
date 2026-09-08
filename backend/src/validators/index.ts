import { z } from 'zod';

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72)
      .regex(/[A-Za-z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  mfaToken: z.string().min(10, 'Invalid verification session'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const resendVerificationSchema = z.object({
  mfaToken: z.string().min(10, 'Invalid verification session'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  walletAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address')
    .or(z.literal(''))
    .optional(),
});

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id format');
const sha256 = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'Hash must be a 64-character hexadecimal SHA-256 value');
const ethAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
const txHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

export const createDocumentSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
  mimeType: z.string().trim().min(3).max(150),
  sha256Hash: sha256,
  // When omitted the document is saved as PENDING and can be registered later
  // via POST /api/documents/:id/register.
  transactionHash: txHash.optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  // Uploads a new revision of an existing document; the parent must already be
  // registered on-chain. Links the new document into the family/version chain.
  parentId: objectId.optional(),
});

export const registerDocumentTxSchema = z.object({
  transactionHash: txHash,
  blockNumber: z.number().int().nonnegative().optional(),
});

export const verifyByUploadSchema = z.object({
  documentId: objectId.optional(),
  calculatedHash: sha256,
});

export const verifyByHashSchema = z.object({ hash: sha256, documentId: objectId.optional() });

export const blockchainRegisterSchema = z.object({
  sha256Hash: sha256,
  transactionHash: txHash,
  blockNumber: z.number().int().nonnegative(),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ALL', 'PENDING', 'CONFIRMED', 'FAILED']).optional(),
  verificationStatus: z.enum(['ALL', 'VERIFIED', 'MODIFIED', 'NOT_FOUND', 'UNVERIFIED']).optional(),
  role: z.enum(['ALL', 'USER', 'ADMIN']).optional(),
  isActive: z.enum(['ALL', 'true', 'false']).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const mongoIdParam = z.object({ id: objectId });

export const documentIdParam = z.object({ documentId: objectId });

export const changeRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
});

export const changeStatusSchema = z.object({
  isActive: z.boolean(),
});

export const totpCodeSchema = z.object({
  token: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
});

/** Accepts either a 6-digit TOTP code or a recovery code (XXXX-XXXX-XXXX). */
export const mfaDisableSchema = z.object({
  token: z
    .string()
    .trim()
    .min(6, 'Enter your authentication code')
    .max(14, 'Invalid authentication code'),
});

export const loginTwoFactorSchema = z.object({
  mfaToken: z.string().min(10, 'Invalid two-factor session'),
  code: z
    .string()
    .trim()
    .min(6, 'Enter your authentication code')
    .max(14, 'Invalid authentication code')
    .transform((value) => value.toUpperCase()),
});

/** A 6-digit OTP code delivered via email or SMS. */
export const otpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

/** An E.164 phone number (country code + national number). */
export const smsSetupSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, 'Enter a valid phone number including country code (e.g. +15551234567)'),
});
