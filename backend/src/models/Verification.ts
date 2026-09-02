import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';
import type { VerificationResult } from '../types';

export interface IVerification extends MongoDocument {
  documentId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  calculatedHash: string;
  blockchainHash?: string;
  result: VerificationResult;
  transactionHash?: string;
  blockNumber?: number;
  ownerWallet?: string;
  registeredAt?: Date;
  verifiedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const verificationSchema = new Schema<IVerification>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calculatedHash: { type: String, required: true, index: true },
    blockchainHash: { type: String },
    result: {
      type: String,
      enum: ['VERIFIED', 'MODIFIED', 'NOT_FOUND'],
      required: true,
      index: true,
    },
    transactionHash: { type: String },
    blockNumber: { type: Number },
    ownerWallet: { type: String },
    registeredAt: { type: Date },
    verifiedAt: { type: Date, default: Date.now, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

export const Verification: Model<IVerification> = mongoose.model<IVerification>(
  'Verification',
  verificationSchema
);
