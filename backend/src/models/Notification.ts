import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export type NotificationType =
  | 'DOCUMENT_VERIFIED'
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_DENIED'
  | 'DOCUMENT_DOWNLOADED';

export interface INotification extends MongoDocument {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'DOCUMENT_VERIFIED',
        'ACCESS_REQUESTED',
        'ACCESS_APPROVED',
        'ACCESS_DENIED',
        'DOCUMENT_DOWNLOADED',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    entityId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);