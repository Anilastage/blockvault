import type { Request, Response } from 'express';
import { FolderModel } from '../models/Folder';
import { DocumentModel } from '../models/Document';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiError } from '../utils/ApiError';

export const listFolders = asyncHandler(async (req: Request, res: Response) => {
  const folders = await FolderModel.find({ userId: req.user!.id }).sort({ name: 1 });
  res.json({ success: true, message: 'Folders retrieved', data: { folders } });
});

export const createFolder = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  const existing = await FolderModel.findOne({ userId: req.user!.id, name });
  if (existing) throw ApiError.conflict('A folder with this name already exists');

  const folder = await FolderModel.create({ userId: req.user!.id, name });
  res.status(201).json({
    success: true,
    message: 'Folder created',
    data: { folder },
  });
});

export const renameFolder = asyncHandler(async (req: Request, res: Response) => {
  const folder = await FolderModel.findById(req.params.id);
  if (!folder) throw ApiError.notFound('Folder not found');

  const isOwner = String(folder.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this folder');
  }

  const { name } = req.body as { name: string };
  const existing = await FolderModel.findOne({ userId: req.user!.id, name, _id: { $ne: folder._id } });
  if (existing) throw ApiError.conflict('A folder with this name already exists');

  folder.name = name;
  await folder.save();

  res.json({ success: true, message: 'Folder renamed', data: { folder } });
});

export const deleteFolder = asyncHandler(async (req: Request, res: Response) => {
  const folder = await FolderModel.findById(req.params.id);
  if (!folder) throw ApiError.notFound('Folder not found');

  const isOwner = String(folder.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this folder');
  }

  await Promise.all([
    DocumentModel.updateMany(
      { userId: req.user!.id, folderId: folder._id },
      { $set: { folderId: null } }
    ),
    folder.deleteOne(),
  ]);

  res.json({
    success: true,
    message: 'Folder deleted. Its documents were moved to Unfiled.',
    data: {},
  });
});