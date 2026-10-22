import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

let transporter: Transporter | null = null;

const isResendConfigured = (): boolean => !!env.email.resendApiKey;

const isSmtpConfigured = (): boolean =>
  env.email.smtpEnabled &&
  !!(env.email.smtpHost && env.email.smtpUser && env.email.smtpPass && env.email.fromAddress);

export const isEmailConfigured = (): boolean => isResendConfigured() || isSmtpConfigured();

const getTransporter = (): Transporter | null => {
  if (!isSmtpConfigured()) return null;
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

const fromAddress = (): string => env.email.fromAddress || 'onboarding@resend.dev';

const subject = 'Your BlockVault verification code';

const textBody = (code: string): string =>
  `Your BlockVault verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can safely ignore this message.`;

const htmlBody = (code: string): string => `
        <div style="font-family: Arial, Helvetica, sans-serif; background:#f6f7f9; padding:24px;">
          <div style="max-width:420px; margin:0 auto; background:#ffffff; border-radius:12px; padding:28px; border:1px solid #e6e8eb;">
            <h2 style="margin:0 0 8px; color:#0f172a;">BlockVault</h2>
            <p style="color:#475569; font-size:14px; line-height:1.5;">Your verification code is:</p>
            <div style="font-size:32px; font-weight:700; letter-spacing:6px; color:#0f172a; text-align:center; margin:16px 0; padding:16px; background:#f1f5f9; border-radius:8px;">${code}</div>
            <p style="color:#64748b; font-size:13px; line-height:1.5;">This code expires in 5 minutes. If you did not request it, you can safely ignore this email.</p>
          </div>
        </div>`;

const sendViaResend = async (to: string, code: string): Promise<void> => {
  const res = await fetch(env.email.resendApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `"${env.email.fromName}" <${fromAddress()}>`,
      to: [to],
      subject,
      text: textBody(code),
      html: htmlBody(code),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
};

const sendViaSmtp = async (to: string, code: string): Promise<void> => {
  const t = getTransporter();
  if (!t) throw new Error('SMTP is not configured');
  await t.sendMail({
    from: `"${env.email.fromName}" <${env.email.fromAddress}>`,
    to,
    subject,
    text: textBody(code),
    html: htmlBody(code),
  });
};

/**
 * Send a 6-digit OTP to the given address through Resend (preferred) or SMTP.
 * Returns true only when the provider accepted the message. Never throws:
 * a failed send returns false so callers can fall back to showing the code
 * on-screen instead of blocking login.
 */
export const sendOtpEmail = async (to: string, code: string): Promise<boolean> => {
  if (!isEmailConfigured()) {
    console.warn('[emailService] Email not configured — skipping OTP email to ' + to);
    return false;
  }

  try {
    if (isResendConfigured()) {
      await sendViaResend(to, code);
    } else {
      await sendViaSmtp(to, code);
    }
    return true;
  } catch (err) {
    console.error('[emailService] OTP email to', to, 'failed:', (err as Error).message);
    return false;
  }
};
