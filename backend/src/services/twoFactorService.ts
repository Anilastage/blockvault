import crypto from 'crypto';
import { generateSecret, generate, verify, generateURI } from 'otplib';

export const SECRET_ISSUER = 'BlockVault';

/** Number of seconds of clock drift (±) accepted when verifying a TOTP code. */
const CLOCK_TOLERANCE_S = 60;

export const createTotpSecret = (): string => generateSecret();

export const createTotpUri = (email: string, secret: string): string =>
  generateURI({ issuer: SECRET_ISSUER, label: email, secret });

/** Produce the current 6-digit code for a secret (used in tests + manual flows). */
export const generateTotpCode = async (secret: string): Promise<string> =>
  generate({ secret });

/** Validate a 6-digit authenticator code against the stored secret. */
export const verifyTotp = async (code: string, secret: string): Promise<boolean> => {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return false;
  const result = await verify({
    secret,
    token: clean,
    epochTolerance: CLOCK_TOLERANCE_S,
  });
  return result.valid;
};

/** e.g. "7F3B-9C12-A84D" — 3 groups of 4 uppercase hex chars. */
export const generateRecoveryCode = (): string => {
  const groups: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    groups.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return groups.join('-');
};

export const generateRecoveryCodes = (count = 10): string[] =>
  Array.from({ length: count }, generateRecoveryCode);

export const hashRecoveryCode = (code: string): string =>
  crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

/** Index of the matching recovery code hash, or -1 when no match. */
export const findRecoveryCodeIndex = (code: string, hashes: string[]): number =>
  hashes.indexOf(hashRecoveryCode(code));