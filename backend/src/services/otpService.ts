import crypto from 'crypto';
import { OtpCode, type OtpPurpose, type OtpChannel } from '../models/OtpCode';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 per channel per 60s
const MAX_ATTEMPTS = 5;

export const generateOtp = (): string =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashOtp = (code: string): string =>
  crypto.createHash('sha256').update(code.trim()).digest('hex');

/** Number of ms until the user may request another OTP for this purpose+channel. */
export const rateLimitRemaining = async (
  userId: string,
  purpose: OtpPurpose,
  channel: OtpChannel
): Promise<number> => {
  const latest = await OtpCode.findOne({ userId, purpose, channel }).sort({ createdAt: -1 });
  if (!latest || !latest.createdAt) return 0;
  const elapsed = Date.now() - new Date(latest.createdAt).getTime();
  const remaining = OTP_RATE_LIMIT_MS - elapsed;
  return remaining > 0 ? remaining : 0;
};

/**
 * Create a new OTP, invalidating any previous unused codes for the same
 * user/channel/purpose. Returns the plaintext code so the caller can deliver
 * it (email/SMS). Caller is responsible for honoring rate limiting.
 */
export const createOtp = async (
  userId: string,
  purpose: OtpPurpose,
  channel: OtpChannel
): Promise<string> => {
  await OtpCode.updateMany(
    { userId, purpose, channel, used: false },
    { $set: { used: true } }
  );

  const code = generateOtp();
  await OtpCode.create({
    userId,
    codeHash: hashOtp(code),
    purpose,
    channel,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  return code;
};

/**
 * Verify a submitted code. Consumes the code on success and invalidates it
 * after MAX_ATTEMPTS failed tries. Returns a boolean.
 */
export const verifyOtp = async (
  userId: string,
  code: string,
  purpose: OtpPurpose,
  channel: OtpChannel
): Promise<boolean> => {
  const clean = code.trim();
  if (!/^\d{6}$/.test(clean)) return false;

  const now = Date.now();
  // Atomically claim the latest unused code so concurrent requests can't both
  // pass verification (TOCTOU). The expiry/attempt checks run inside the same
  // update guard; a record only counts as used when the code genuinely matches.
  const record = await OtpCode.findOneAndUpdate(
    {
      userId,
      purpose,
      channel,
      used: false,
      expiresAt: { $gt: new Date(now) },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { sort: { createdAt: -1 }, new: true }
  );

  if (!record) return false;

  if (record.codeHash !== hashOtp(clean)) {
    // Exhausted attempts: permanently invalidate the code.
    if (record.attempts >= MAX_ATTEMPTS) {
      await record.updateOne({ $set: { used: true } });
    }
    return false;
  }

  await record.updateOne({ $set: { used: true } });
  return true;
};
