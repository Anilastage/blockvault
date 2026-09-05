import { api, unwrap } from './api';
import type { User, TwoFactorSetup, MfaMethod } from '@/types';

interface AuthResponse {
  token: string;
  user: User;
}

export interface EmailVerifyChallenge {
  requiresEmailVerification: true;
  mfaToken: string;
  method: 'email_verify';
  user: User;
  devCode?: string;
}

export type LoginResponse =
  | { requiresEmailVerification: false; requiresTwoFactor: false; token: string; user: User }
  | {
      requiresEmailVerification: false;
      requiresTwoFactor: true;
      mfaToken: string;
      method: MfaMethod;
      user: User;
      devCode?: string;
    }
  | EmailVerifyChallenge;

export type RegisterResponse = EmailVerifyChallenge;

export const authService = {
  /**
   * Create the account and return the mandatory email-verification challenge.
   * A session token is ONLY issued after the OTP is confirmed via verifyEmail.
   */
  async register(payload: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }): Promise<RegisterResponse> {
    const res = await api.post('/auth/register', payload);
    return unwrap<RegisterResponse>(res.data);
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await api.post('/auth/login', { email, password });
    return unwrap<LoginResponse>(res.data);
  },

  /** Confirm the signup/verification OTP and receive the session token. */
  async verifyEmail(mfaToken: string, code: string): Promise<AuthResponse> {
    const res = await api.post('/auth/verify-email', { mfaToken, code });
    return unwrap<AuthResponse>(res.data);
  },

  /** Re-send the email verification OTP (rate-limited on the server). */
  async resendVerification(mfaToken: string): Promise<{ devCode?: string }> {
    const res = await api.post('/auth/resend-verification', { mfaToken });
    return unwrap<{ devCode?: string }>(res.data);
  },

  /** Step 2 of two-factor login: exchange the MFA challenge for a session. */
  async verifyMfa(mfaToken: string, code: string): Promise<AuthResponse> {
    const res = await api.post('/auth/2fa/login', { mfaToken, code });
    return unwrap<AuthResponse>(res.data);
  },

  async start2faSetup(): Promise<TwoFactorSetup> {
    const res = await api.post('/auth/2fa/setup');
    return unwrap<TwoFactorSetup>(res.data);
  },

  async verify2faSetup(token: string): Promise<void> {
    await api.post('/auth/2fa/verify', { token });
  },

  async disable2fa(token: string): Promise<void> {
    await api.post('/auth/2fa/disable', { token });
  },

  async regenerateRecoveryCodes(token: string): Promise<{ recoveryCodes: string[] }> {
    const res = await api.post('/auth/2fa/recovery', { token });
    return unwrap<{ recoveryCodes: string[] }>(res.data);
  },

  async startEmailOtpSetup(): Promise<{ message: string }> {
    const res = await api.post('/auth/2fa/email/setup');
    return unwrap<{ message: string }>(res.data);
  },

  async verifyEmailOtpSetup(code: string): Promise<{ enabled: boolean; mfaMethod: MfaMethod }> {
    const res = await api.post('/auth/2fa/email/verify', { code });
    return unwrap<{ enabled: boolean; mfaMethod: MfaMethod }>(res.data);
  },

  async startSmsOtpSetup(phoneNumber: string): Promise<{ message: string }> {
    const res = await api.post('/auth/2fa/sms/setup', { phoneNumber });
    return unwrap<{ message: string }>(res.data);
  },

  async verifySmsOtpSetup(code: string, phoneNumber: string): Promise<{ enabled: boolean; mfaMethod: MfaMethod }> {
    const res = await api.post('/auth/2fa/sms/verify', { code, phoneNumber });
    return unwrap<{ enabled: boolean; mfaMethod: MfaMethod }>(res.data);
  },

  async me(): Promise<User> {
    const res = await api.get('/auth/me');
    return unwrap<{ user: User }>(res.data).user;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort; local state is cleared regardless.
    }
  },

  async updateProfile(payload: { fullName?: string; walletAddress?: string }): Promise<User> {
    const res = await api.put('/users/profile', payload);
    return unwrap<{ user: User }>(res.data).user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/users/password', { currentPassword, newPassword });
  },
};
