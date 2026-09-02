import crypto from 'crypto';
import fs from 'fs';

export const sha256Buffer = (buffer: Buffer): string =>
  crypto.createHash('sha256').update(buffer).digest('hex');

export const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const HASH_REGEX = /^[a-fA-F0-9]{64}$/;

export const isValidSha256 = (hash: string): boolean => HASH_REGEX.test(hash);

/** Converts a 32-byte hex string to an EVM bytes32 value (0x-prefixed). */
export const hexToBytes32 = (hash: string): `0x${string}` => {
  if (!isValidSha256(hash)) {
    throw new Error('Invalid SHA-256 hash: expected 64 hexadecimal characters');
  }
  return `0x${hash.toLowerCase()}` as `0x${string}`;
};
