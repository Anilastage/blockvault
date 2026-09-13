import mongoose, { Schema, type Document as MongoDocument, type Model } from 'mongoose';

export interface IFolder extends MongoDocument {
  userId: mongoose.Types.ObjectId;
  name: string;
}

const folderSchema = new Schema<IFolder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

folderSchema.index({ userId: 1, name: 1 }, { unique: true });

export const FolderModel: Model<IFolder> = mongoose.model<IFolder>('Folder', folderSchema);