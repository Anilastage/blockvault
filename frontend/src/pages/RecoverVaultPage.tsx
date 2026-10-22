import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { vaultService } from '@/services/vaultService';
import { getApiErrorMessage } from '@/services/api';
import { createPasswordEnvelope, unwrapVaultKeyWithRecovery } from '@/utils/crypto';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import type { VaultRecoveryStart } from '@/types';

type Stage = 'email' | 'reset' | 'done';

export const RecoverVaultPage = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [recovery, setRecovery] = useState<VaultRecoveryStart | null>(null);
  const [phrase, setPhrase] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter the email address for your account.');
      return;
    }
    setLoading(true);
    try {
      const result = await vaultService.startRecovery(email.trim());
      setRecovery(result);
      setStage('reset');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!recovery) return;
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Use at least 8 characters, including a letter and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (recovery.hasVault) {
        if (!phrase.trim()) {
          setError('Enter your recovery phrase to keep access to your encrypted documents.');
          return;
        }
        if (!recovery.recoveryWrappedVaultKey || !recovery.recoveryWrapIv) {
          setError('This account is missing its recovery key. Contact an administrator.');
          return;
        }

        let vaultKeyRaw: Uint8Array;
        try {
          vaultKeyRaw = await unwrapVaultKeyWithRecovery(
            {
              recoveryWrappedVaultKey: recovery.recoveryWrappedVaultKey,
              recoveryWrapIv: recovery.recoveryWrapIv,
            },
            phrase
          );
        } catch {
          setError('That recovery phrase does not match this account.');
          return;
        }

        const envelope = await createPasswordEnvelope(vaultKeyRaw, newPassword);
        await vaultService.completeRecovery({
          recoveryToken: recovery.recoveryToken,
          code: code.trim(),
          newPassword,
          recoveryWrappedVaultKey: recovery.recoveryWrappedVaultKey,
          recoveryWrapIv: recovery.recoveryWrapIv,
          vault: envelope,
        });
      } else {
        await vaultService.completeRecovery({
          recoveryToken: recovery.recoveryToken,
          code: code.trim(),
          newPassword,
        });
      }
      setStage('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>

        <Card className="p-6 sm:p-8">
          {stage === 'done' ? (
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h1 className="mt-4 text-xl font-bold text-dark">Vault recovered</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Your password and encryption vault have been reset. Sign in with your new password
                to access your encrypted documents.
              </p>
              <Button fullWidth className="mt-6" onClick={() => navigate('/login', { replace: true })}>
                Continue to sign in
              </Button>
            </div>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                {stage === 'email' ? <Mail className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
              </span>
              <h1 className="mt-4 text-xl font-bold text-dark">
                {stage === 'email' ? 'Forgot your password?' : 'Reset your password'}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                {stage === 'email'
                  ? 'Enter your account email and we will send you a 6-digit verification code.'
                  : recovery?.hasVault
                    ? 'Enter the code from your email and your saved recovery phrase to set a new password and keep your encrypted documents.'
                    : 'Enter the code from your email and choose a new password.'}
              </p>

              {error && (
                <div className="mt-4 rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {stage === 'email' ? (
                <form className="mt-6 space-y-4" onSubmit={start} noValidate>
                  <Input
                    label="Email address"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button type="submit" fullWidth size="lg" loading={loading} icon={<Mail className="h-4 w-4" />}>
                    Send recovery code
                  </Button>
                </form>
              ) : (
                <form className="mt-6 space-y-4" onSubmit={reset} noValidate>
                  {recovery?.devCode && (
                    <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
                      <p className="font-semibold text-warning-800">Email delivery not configured</p>
                      <p className="mt-1">
                        Your development code is{' '}
                        <span className="font-mono text-base font-bold tracking-widest">
                          {recovery.devCode}
                        </span>
                      </p>
                    </div>
                  )}
                  {recovery?.hasVault && (
                    <Input
                      label="Recovery phrase"
                      placeholder="XXXX-XXXX-XXXX..."
                      className="font-mono text-xs tracking-wider"
                      autoComplete="off"
                      spellCheck={false}
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value.toUpperCase())}
                      hint="Hyphens and spaces are ignored."
                    />
                  )}
                  <Input
                    label="Email code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="font-mono text-lg tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <Input
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    hint="Minimum 8 characters, with letters and numbers."
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    loading={loading}
                    icon={<ShieldCheck className="h-4 w-4" />}
                  >
                    {recovery?.hasVault ? 'Reset password & keep documents' : 'Reset password'}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-slate-500 hover:text-primary-600"
                    onClick={() => {
                      setStage('email');
                      setRecovery(null);
                      setCode('');
                      setError('');
                    }}
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </>
          )}
        </Card>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          Accounts with an encryption vault need the recovery phrase to keep existing encrypted
          documents readable. If you have lost both your password and phrase, those documents cannot
          be restored.
        </p>
      </div>
    </div>
  );
};
