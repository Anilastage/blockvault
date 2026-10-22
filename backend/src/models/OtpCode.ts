import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export type OtpPurpose = 'mfa_login' | 'mfa_setup' | 'email_verify' | 'vault_recovery';
export type OtpChannel = 'email' | 'sms';

export interface IOtpCode extends MongoDocument {
  userId: mongoose.Types.ObjectId;
  /** SHA-256 hash of the plaintext 6-digit code. Never store the raw code. */
  codeHash: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  expiresAt: Date;
  used: boolean;
  /** Failed verification attempts. Codes are invalidated after 5. */
  attempts: number;
  createdAt?: Date;
}

const otpCodeSchema = new Schema<IOtpCode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['mfa_login', 'mfa_setup', 'email_verify', 'vault_recovery'],
      required: true,
    },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    used: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const OtpCode: Model<IOtpCode> = mongoose.model<IOtpCode>('OtpCode', otpCodeSchema);
