import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export interface IUser extends MongoDocument {
  fullName: string;
  email: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
  walletAddress?: string;
  profileImage?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  twoFactorEnabled: boolean;
  /** Base32 TOTP secret. Hidden from JSON and default queries. */
  twoFactorSecret?: string;
  /** SHA-256 hashes of one-time recovery codes (plaintext shown once at setup). */
  twoFactorRecoveryCodes?: string[];
  /** True while a secret is staged but the setup code has not been verified yet. */
  twoFactorPendingSetup: boolean;
  /** The active MFA method used at sign-in. Absent when 2FA is disabled. */
  mfaMethod?: 'totp' | 'email_otp' | 'sms_otp';
  /** E.164 phone number used for SMS OTP delivery. */
  phoneNumber?: string;
  /** True once the user confirms the email address with a sent OTP code. */
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER', index: true },
    walletAddress: { type: String, lowercase: true, default: undefined, index: true },
    profileImage: { type: String },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false, default: undefined },
    twoFactorRecoveryCodes: { type: [String], select: false, default: undefined },
    twoFactorPendingSetup: { type: Boolean, default: false },
    mfaMethod: {
      type: String,
      enum: ['totp', 'email_otp', 'sms_otp'],
      default: undefined,
    },
    phoneNumber: { type: String, trim: true, default: undefined },
    emailVerified: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const plain = ret as unknown as Record<string, unknown>;
    delete plain.passwordHash;
    delete plain.twoFactorSecret;
    delete plain.twoFactorRecoveryCodes;
    delete plain.twoFactorPendingSetup;
    delete plain.__v;
    return plain;
  },
});

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
