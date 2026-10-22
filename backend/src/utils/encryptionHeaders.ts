import type { Response } from 'express';
import type { IDocument } from '../models/Document';

export type EncryptionWrapAlgorithm = 'AES-GCM-VAULT' | 'AES-GCM-SHARE' | 'RSA-OAEP';

interface EncryptedDocument {
  encryption?: IDocument['encryption'];
  mimeType: string;
  originalName: string;
}

export const setEncryptedFileHeaders = (
  res: Response,
  document: EncryptedDocument,
  options: {
    wrappedKey?: string;
    keyIv?: string;
    wrapAlg?: EncryptionWrapAlgorithm;
  } = {}
): boolean => {
  const encryption = document.encryption;
  if (!encryption) return false;

  res.setHeader('X-BlockVault-Encrypted', '1');
  res.setHeader('X-BlockVault-File-Iv', encryption.iv);
  res.setHeader('X-BlockVault-Mime-Type', document.mimeType);
  res.setHeader('X-BlockVault-Original-Name', encodeURIComponent(document.originalName));

  if (options.wrappedKey) {
    res.setHeader('X-BlockVault-Wrapped-Key', options.wrappedKey);
    res.setHeader('X-BlockVault-Key-Iv', options.keyIv ?? encryption.keyIv);
    res.setHeader('X-BlockVault-Wrap-Alg', options.wrapAlg ?? 'AES-GCM-VAULT');
  }

  return true;
};
