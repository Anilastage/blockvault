import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';
import type { BlockchainStatus, VerificationStatus } from '../types';

export interface IDocument extends MongoDocument {
  userId: mongoose.Types.ObjectId;
  originalName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  sha256Hash: string;
  blockchainHash?: string;
  transactionHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  chainId?: number;
  uploadedAt: Date;
  blockchainStatus: BlockchainStatus;
  verificationStatus: VerificationStatus;
  /** id of the first document in the version family; absent for standalone documents. */
  familyId?: mongoose.Types.ObjectId;
  /** 1-based revision number within the family. */
  version?: number;
  previousVersionId?: mongoose.Types.ObjectId;
  previousVersionHash?: string;
  folderId?: mongoose.Types.ObjectId | null;
  tags?: string[];
}

const documentSchema = new Schema<IDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    storagePath: { type: String, required: true },
    sha256Hash: { type: String, required: true, index: true },
    blockchainHash: { type: String },
    transactionHash: { type: String, index: true },
    blockNumber: { type: Number },
    contractAddress: { type: String },
    chainId: { type: Number },
    uploadedAt: { type: Date, default: Date.now, index: true },
    blockchainStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ['UNVERIFIED', 'VERIFIED', 'MODIFIED', 'NOT_FOUND'],
      default: 'UNVERIFIED',
      index: true,
    },
    familyId: { type: Schema.Types.ObjectId, ref: 'Document', index: true },
    version: { type: Number },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'Document' },
    previousVersionHash: { type: String },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

documentSchema.index({ originalName: 'text', sha256Hash: 'text', transactionHash: 'text' });
documentSchema.index({ familyId: 1, version: 1 });
documentSchema.index({ userId: 1, folderId: 1 });

export const DocumentModel: Model<IDocument> = mongoose.model<IDocument>(
  'Document',
  documentSchema
);
