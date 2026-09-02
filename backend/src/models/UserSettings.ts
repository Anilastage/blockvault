import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export interface IUserSettings extends MongoDocument {
  userId: mongoose.Types.ObjectId;
  general: {
    language: string;
    timezone: string;
    dateFormat: string;
  };
  notifications: {
    emailNotifications: boolean;
    verificationAlerts: boolean;
    transactionAlerts: boolean;
    securityAlerts: boolean;
    systemUpdates: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'system';
  };
}

const settingsSchema = new Schema<IUserSettings>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    general: {
      language: { type: String, default: 'en' },
      timezone: { type: String, default: Intl.DateTimeFormat().resolvedOptions().timeZone },
      dateFormat: { type: String, enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], default: 'DD/MM/YYYY' },
    },
    notifications: {
      emailNotifications: { type: Boolean, default: true },
      verificationAlerts: { type: Boolean, default: true },
      transactionAlerts: { type: Boolean, default: true },
      securityAlerts: { type: Boolean, default: true },
      systemUpdates: { type: Boolean, default: false },
    },
    appearance: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    },
  },
  { timestamps: true }
);

export const UserSettings: Model<IUserSettings> = mongoose.model<IUserSettings>(
  'UserSettings',
  settingsSchema
);
