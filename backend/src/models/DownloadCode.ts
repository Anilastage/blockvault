import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export interface IDownloadCode extends MongoDocument {
  documentId: mongoose.Types.ObjectId;
  /** Shareable code the recipient must enter to download the document. */
  code: string;
  /** Moment after which the current code stops being valid. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const downloadCodeSchema = new Schema<IDownloadCode>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      unique: true,
      index: true,
    },
    code: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

downloadCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DownloadCode: Model<IDownloadCode> = mongoose.model<IDownloadCode>(
  'DownloadCode',
  downloadCodeSchema
);
