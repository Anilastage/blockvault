import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'USED';

export interface IAccessRequest extends MongoDocument {
  documentId: mongoose.Types.ObjectId;
  requesterId: mongoose.Types.ObjectId;
  reason?: string;
  status: AccessRequestStatus;
  /** One-time bearer token issued when the owner approves the request. */
  accessToken?: string;
  /** Document key wrapped for the requester's RSA public key on approval. */
  requesterWrappedKey?: string;
  /** Moment the access link expires (set when approved). */
  expiresAt?: Date;
  /** Set when the one-time link is actually consumed. */
  usedAt?: Date;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
}

const accessRequestSchema = new Schema<IAccessRequest>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'USED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    accessToken: { type: String, index: true, unique: true, sparse: true },
    requesterWrappedKey: { type: String },
    expiresAt: { type: Date },
    usedAt: { type: Date },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

accessRequestSchema.index({ documentId: 1, requesterId: 1, status: 1 });

export const AccessRequest: Model<IAccessRequest> = mongoose.model<IAccessRequest>(
  'AccessRequest',
  accessRequestSchema
);