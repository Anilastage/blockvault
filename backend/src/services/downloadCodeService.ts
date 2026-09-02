import crypto from 'crypto';
import mongoose from 'mongoose';
import { DownloadCode } from '../models/DownloadCode';

/** A download code stays valid for this long before rotating to a new one. */
export const DOWNLOAD_CODE_TTL_MS = 20 * 60 * 1000;

const CODE_LENGTH = 8;
// Omit easily-confused characters to keep the code shareable over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface DownloadCodeInfo {
  code: string;
  expiresAt: Date;
  secondsLeft: number;
}

const isCodeUnexpired = (expiresAt: Date): boolean => expiresAt.getTime() > Date.now();

const generateCode = (): string => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
};

/**
 * Return the current valid code for a document, rotating to a fresh one as soon
 * as the previous code expires. Ensures the code handed to the owner always has
 * a full 20-minute window.
 */
export const getOrCreateDownloadCode = async (
  documentId: mongoose.Types.ObjectId | string
): Promise<DownloadCodeInfo> => {
  const docId = String(documentId);

  // Try to keep using a still-valid code so a shared link stays live right up
  // until its window ends.
  const existing = await DownloadCode.findOne({ documentId: docId });
  if (existing && isCodeUnexpired(existing.expiresAt)) {
    return {
      code: existing.code,
      expiresAt: existing.expiresAt,
      secondsLeft: Math.max(0, Math.floor((existing.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  // Generate a fresh unique code (avoid rare collisions across documents).
  let code = generateCode();
  while (await DownloadCode.exists({ code })) {
    code = generateCode();
  }

  const expiresAt = new Date(Date.now() + DOWNLOAD_CODE_TTL_MS);

  if (existing) {
    existing.code = code;
    existing.expiresAt = expiresAt;
    await existing.save();
    return { code, expiresAt, secondsLeft: DOWNLOAD_CODE_TTL_MS / 1000 };
  }

  await DownloadCode.create({ documentId: docId, code, expiresAt });
  return { code, expiresAt, secondsLeft: DOWNLOAD_CODE_TTL_MS / 1000 };
};

/** Force a brand-new code immediately (dropping any leftover window). */
export const regenerateDownloadCode = async (
  documentId: mongoose.Types.ObjectId | string
): Promise<DownloadCodeInfo> => {
  const docId = String(documentId);

  let code = generateCode();
  while (await DownloadCode.exists({ code })) {
    code = generateCode();
  }
  const expiresAt = new Date(Date.now() + DOWNLOAD_CODE_TTL_MS);

  const existing = await DownloadCode.findOne({ documentId: docId });
  if (existing) {
    existing.code = code;
    existing.expiresAt = expiresAt;
    await existing.save();
  } else {
    await DownloadCode.create({ documentId: docId, code, expiresAt });
  }

  return { code, expiresAt, secondsLeft: DOWNLOAD_CODE_TTL_MS / 1000 };
};

export interface DownloadCodeLookup {
  documentId: string;
  code: string;
  expiresAt: Date;
}

/**
 * Resolve a submitted share-able download code to its document. Only returns
 * codes that are present and not yet expired; expired/unknown codes return null.
 */
export const findValidDownloadCode = async (
  code: string
): Promise<DownloadCodeLookup | null> => {
  const normalized = code.trim().toUpperCase();
  const record = await DownloadCode.findOne({ code: normalized });
  if (!record) return null;
  if (!isCodeUnexpired(record.expiresAt)) {
    await DownloadCode.deleteOne({ _id: record._id });
    return null;
  }
  return {
    documentId: String(record.documentId),
    code: record.code,
    expiresAt: record.expiresAt,
  };
};
