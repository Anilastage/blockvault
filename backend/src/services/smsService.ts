import { env } from '../config/env';

// Twilio is an optional dependency — dynamically required only when configured
// so the app runs without it when SMS OTP is not set up.
type TwilioClient = { messages: { create: (opts: object) => Promise<unknown> } };

let client: TwilioClient | null = null;

const isConfigured = (): boolean =>
  !!(env.sms.twilioAccountSid && env.sms.twilioAuthToken && env.sms.twilioFromNumber);

const getClient = (): TwilioClient | null => {
  if (!isConfigured()) return null;
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    client = twilio(env.sms.twilioAccountSid, env.sms.twilioAuthToken) as TwilioClient;
  }
  return client;
};

/**
 * Send a 6-digit OTP via SMS. Gracefully no-ops (logging a warning) when
 * Twilio is not configured, so the app still works without it.
 */
export const sendOtpSms = async (to: string, code: string): Promise<void> => {
  const c = getClient();
  if (!c) {
    console.warn('[smsService] Twilio not configured — skipping OTP SMS to ' + to);
    return;
  }

  await c.messages.create({
    to,
    from: env.sms.twilioFromNumber,
    body: `Your BlockVault verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can safely ignore this message.`,
  });
};
