import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

const isConfigured = (): boolean =>
  env.email.smtpEnabled &&
  !!(env.email.smtpHost && env.email.smtpUser && env.email.smtpPass && env.email.fromAddress);

const getTransporter = (): Transporter | null => {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.email.smtpHost,
      port: env.email.smtpPort,
      secure: env.email.smtpPort === 465,
      auth: { user: env.email.smtpUser, pass: env.email.smtpPass },
    });
  }
  return transporter;
};

export const isEmailConfigured = (): boolean => isConfigured();

/**
 * Send a 6-digit OTP to the given address. Gracefully no-ops (logging a
 * warning) when SMTP is not configured, so the app still works without it.
 */
export const sendOtpEmail = async (to: string, code: string): Promise<void> => {
  const t = getTransporter();
  if (!t) {
    console.warn(
      '[emailService] SMTP not configured — skipping OTP email to ' + to
    );
    return;
  }

  try {
    await t.sendMail({
      from: `"${env.email.fromName}" <${env.email.fromAddress}>`,
      to,
      subject: 'Your BlockVault verification code',
      text: `Your BlockVault verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can safely ignore this email.`,
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f7f9; padding:24px;">
          <div style="max-width:420px; margin:0 auto; background:#ffffff; border-radius:12px; padding:28px; border:1px solid #e6e8eb;">
            <h2 style="margin:0 0 8px; color:#0f172a;">BlockVault</h2>
            <p style="color:#475569; font-size:14px; line-height:1.5;">Your verification code is:</p>
            <div style="font-size:32px; font-weight:700; letter-spacing:6px; color:#0f172a; text-align:center; margin:16px 0; padding:16px; background:#f1f5f9; border-radius:8px;">${code}</div>
            <p style="color:#64748b; font-size:13px; line-height:1.5;">This code expires in 5 minutes. If you did not request it, you can safely ignore this email.</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('[emailService] OTP email to', to, 'failed:', (err as Error).message);
    throw err;
  }
};
