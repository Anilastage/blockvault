import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export type DownloadMethod = 'OWNER' | 'ADMIN' | 'ACCESS_GRANT' | 'SHARE_CODE';

export interface IDownloadRecord extends MongoDocument {
  documentId: mongoose.Types.ObjectId;
  requesterId?: mongoose.Types.ObjectId;
  /** Who the downloader was: the owner, an admin, or an access-grant recipient. */
  method: DownloadMethod;
  requestId?: mongoose.Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  downloadedAt: Date;
}

const downloadRecordSchema = new Schema<IDownloadRecord>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    method: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'ACCESS_GRANT', 'SHARE_CODE'],
      required: true,
    },
    requestId: { type: Schema.Types.ObjectId, ref: 'AccessRequest' },
    ipAddress: { type: String },
    userAgent: { type: String },
    downloadedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: false, updatedAt: false } }
);

downloadRecordSchema.index({ documentId: 1, downloadedAt: -1 });

export const DownloadRecord: Model<IDownloadRecord> = mongoose.model<IDownloadRecord>(
  'DownloadRecord',
  downloadRecordSchema
);