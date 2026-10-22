import type { AxiosResponse } from 'axios';
import { saveBlob } from '@/services/api';
import {
  decryptFileBytes,
  encryptedBytesToBlob,
  unwrapKeyWithPrivateKey,
  unwrapWithAesKey,
} from './crypto';
import { getVaultAccessor } from './vaultStore';

const header = (res: AxiosResponse, name: string): string | undefined => {
  const value = res.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
};

export const saveDownloadResponse = async (
  res: AxiosResponse,
  fallbackName: string,
  options: { shareKeyRaw?: Uint8Array } = {}
): Promise<void> => {
  const blob = res.data as Blob;
  if (header(res, 'x-blockvault-encrypted') !== '1') {
    saveBlob(blob, fallbackName);
    return;
  }

  const wrappedKey = header(res, 'x-blockvault-wrapped-key');
  const fileIv = header(res, 'x-blockvault-file-iv');
  const keyIv = header(res, 'x-blockvault-key-iv');
  const wrapAlg = header(res, 'x-blockvault-wrap-alg') ?? 'AES-GCM-VAULT';
  const mimeType = header(res, 'x-blockvault-mime-type') ?? blob.type ?? 'application/octet-stream';
  const encodedName = header(res, 'x-blockvault-original-name');
  const fileName = encodedName ? decodeURIComponent(encodedName) : fallbackName;

  if (!wrappedKey || !fileIv) {
    throw new Error(
      'This document is end-to-end encrypted. Open the full secure share link, or ask the owner to approve an access request.'
    );
  }

  let dekRaw: Uint8Array;
  if (wrapAlg === 'AES-GCM-SHARE') {
    if (!options.shareKeyRaw) {
      throw new Error(
        'This document is encrypted. Open the full secure share link (not just the code) to decrypt it.'
      );
    }
    dekRaw = await unwrapWithAesKey(wrappedKey, keyIv ?? fileIv, options.shareKeyRaw);
  } else if (wrapAlg === 'RSA-OAEP') {
    const accessor = getVaultAccessor();
    if (!accessor) {
      throw new Error('Unlock your vault to decrypt this document.');
    }
    const privateKey = await accessor.getPrivateKey();
    dekRaw = await unwrapKeyWithPrivateKey(wrappedKey, privateKey);
  } else {
    const accessor = getVaultAccessor();
    if (!accessor) {
      throw new Error('Unlock your vault to decrypt this document.');
    }
    const vaultKeyRaw = await accessor.getVaultKeyRaw();
    dekRaw = await unwrapWithAesKey(wrappedKey, keyIv ?? fileIv, vaultKeyRaw);
  }

  const ciphertext = new Uint8Array(await blob.arrayBuffer());
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptFileBytes(ciphertext, fileIv, dekRaw);
  } catch {
    throw new Error('The document could not be decrypted. The key may be invalid.');
  }

  saveBlob(encryptedBytesToBlob(plaintext, mimeType), fileName);
};
