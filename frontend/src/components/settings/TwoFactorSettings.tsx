import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Check,
  Copy,
  KeyRound,
  Mail,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { TwoFactorSetup, MfaMethod } from '@/types';

type Mode = 'setup' | 'codes' | 'disable';
type SetupMethod = 'totp' | 'email_otp' | 'sms_otp';

const METHOD_LABEL: Record<MfaMethod, string> = {
  totp: 'Authenticator app',
  email_otp: 'Email code',
  sms_otp: 'SMS code',
};

const METHOD_DESC: Record<MfaMethod, string> = {
  totp: 'A code from your authenticator app',
  email_otp: 'A one-time code sent to your email',
  sms_otp: 'A one-time code sent to your phone',
};

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
};

export const TwoFactorSettings = ({
  enabled,
  mfaMethod,
}: {
  enabled: boolean;
  mfaMethod?: MfaMethod;
}) => {
  const toast = useToast();
  const { refreshUser } = useAuth();

  const [mode, setMode] = useState<Mode | null>(null);
  const [setupMethod, setSetupMethod] = useState<SetupMethod>('totp');
  const [code, setCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const openModal = (m: Mode) => {
    setMode(m);
    setCode('');
    setPhoneNumber(mfaMethod === 'sms_otp' ? '' : '');
    setError('');
    setSetup(null);
    setNewCodes(null);
    setCopied(null);
    setResent(false);
  };

  // ---------- TOTP ----------
  const startSetup = useMutation({
    mutationFn: () => authService.start2faSetup(),
    onSuccess: (data) => {
      setSetup(data);
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const verifySetup = useMutation({
    mutationFn: () => authService.verify2faSetup(code.trim()),
    onSuccess: async () => {
      await refreshUser();
      setMode(null);
      toast('Two-factor authentication is now enabled.', 'success');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  // ---------- Email OTP ----------
  const startEmailSetup = useMutation({
    mutationFn: () => authService.startEmailOtpSetup(),
    onSuccess: () => {
      setResent(true);
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const verifyEmailSetup = useMutation({
    mutationFn: () => authService.verifyEmailOtpSetup(code.trim()),
    onSuccess: async () => {
      await refreshUser();
      setMode(null);
      toast('Email two-factor authentication is now enabled.', 'success');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  // ---------- SMS OTP ----------
  const startSmsSetup = useMutation({
    mutationFn: () => authService.startSmsOtpSetup(phoneNumber.trim()),
    onSuccess: () => {
      setResent(true);
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const verifySmsSetup = useMutation({
    mutationFn: () => authService.verifySmsOtpSetup(code.trim(), phoneNumber.trim()),
    onSuccess: async () => {
      await refreshUser();
      setMode(null);
      toast('SMS two-factor authentication is now enabled.', 'success');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  // ---------- Shared ----------
  const sendRequestCode = () => {
    if (setupMethod === 'email_otp') startEmailSetup.mutate();
    else if (setupMethod === 'sms_otp') startSmsSetup.mutate();
  };

  const confirmCode = () => {
    if (setupMethod === 'email_otp') verifyEmailSetup.mutate();
    else if (setupMethod === 'sms_otp') verifySmsSetup.mutate();
    else verifySetup.mutate();
  };

  const regenerate = useMutation({
    mutationFn: () => authService.regenerateRecoveryCodes(code.trim()),
    onSuccess: (data) => {
      setNewCodes(data.recoveryCodes);
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const disable = useMutation({
    mutationFn: () => authService.disable2fa(code.trim()),
    onSuccess: async () => {
      await refreshUser();
      setMode(null);
      toast('Two-factor authentication has been disabled.', 'success');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const copyText = async (text: string, key: string) => {
    await copy(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const choosingMethod = !enabled && !setup;

  return (
    <>
      {/* Row */}
      <div className="flex flex-col gap-3 border-b border-slate-50 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-dark">Two-Factor Authentication</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {enabled && mfaMethod
              ? `Sign-ins require ${METHOD_DESC[mfaMethod]}.`
              : 'Add an extra layer of protection to sign-ins.'}
          </p>
        </div>
        <div className="shrink-0">
          {enabled && mfaMethod ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1 text-xs font-semibold text-success-600">
                <ShieldCheck className="h-3.5 w-3.5" /> {METHOD_LABEL[mfaMethod]}
              </span>
              {mfaMethod === 'totp' && (
                <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => openModal('codes')}>
                  New recovery codes
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<ShieldOff className="h-4 w-4" />} onClick={() => openModal('disable')}>
                Disable
              </Button>
            </div>
          ) : (
            <Button size="sm" icon={<Smartphone className="h-4 w-4" />} onClick={() => openModal('setup')}>
              Enable two-factor auth
            </Button>
          )}
        </div>
      </div>

      {/* Method chooser + setup modal */}
      <Modal open={mode === 'setup'} onClose={() => setMode(null)} title="Enable two-factor authentication" size="md">
        <div className="space-y-5">
          {choosingMethod && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Choose how you want to receive your one-time verification code.</p>
              {error && <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">{error}</div>}
              <MethodCard
                selected={setupMethod === 'totp'}
                icon={<Smartphone className="h-5 w-5" />}
                title="Authenticator app"
                desc="Use apps like Google Authenticator or Authy for a rotating code."
                onClick={() => setSetupMethod('totp')}
              />
              <MethodCard
                selected={setupMethod === 'email_otp'}
                icon={<Mail className="h-5 w-5" />}
                title="Email code"
                desc="We email a one-time code to your address on each sign-in."
                onClick={() => setSetupMethod('email_otp')}
              />
              <MethodCard
                selected={setupMethod === 'sms_otp'}
                icon={<MessageSquare className="h-5 w-5" />}
                title="SMS code"
                desc="We text a one-time code to your phone on each sign-in."
                onClick={() => setSetupMethod('sms_otp')}
              />
              <div className="flex justify-end">
                <Button onClick={() => { setError(''); if (setupMethod === 'totp') startSetup.mutate(); else sendRequestCode(); }}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* TOTP QR/recovery setup */}
          {setupMethod === 'totp' && setup && (
            <>
              <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-5 sm:flex-row">
                <img
                  src={setup.qrDataUrl}
                  alt="Scan with your authenticator app"
                  className="h-36 w-36 rounded-lg border border-slate-200 bg-white p-1"
                />
                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-700">Manual entry secret</p>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs ring-1 ring-slate-200">
                        {setup.secret}
                      </code>
                      <Button size="sm" variant="outline" icon={copied === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => copyText(setup.secret, 'secret')}>
                        {copied === 'secret' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-700">Recovery codes</p>
                    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                      {setup.recoveryCodes.map((rc) => (
                        <code key={rc} className="font-mono text-xs text-slate-600">{rc}</code>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1.5"
                      icon={copied === 'recovery' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      onClick={() => copyText(setup.recoveryCodes.join('\n'), 'recovery')}
                    >
                      Copy recovery codes
                    </Button>
                  </div>
                </div>
              </div>

              <p className="flex items-start gap-2 rounded-lg bg-warning-50 px-4 py-3 text-xs text-warning-600 dark:bg-warning-500/10 dark:text-warning">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                If you lose your authenticator app and these recovery codes, you'll be locked out of your account.
              </p>

              <div className="space-y-2">
                <Input
                  label="Confirm the 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  placeholder="Enter the code from your authenticator app"
                  inputMode="numeric"
                  error={error ? error : undefined}
                  className="font-mono tracking-widest"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSetup(null)}>Back</Button>
                <Button loading={verifySetup.isPending} disabled={code.length !== 6} onClick={confirmCode}>
                  Enable & continue
                </Button>
              </div>
            </>
          )}

          {/* Email / SMS OTP setup */}
          {setupMethod !== 'totp' && (
            <div className="space-y-4">
              {error && <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">{error}</div>}
              {resent && (
                <div className="rounded-lg border border-success-100 bg-success-100/40 px-4 py-3 text-sm text-success-600">
                  A verification code has been sent. Check your {setupMethod === 'email_otp' ? 'email inbox' : 'phone messages'}.
                </div>
              )}
              {!resent ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    {setupMethod === 'email_otp'
                      ? 'We\'ll send a one-time code to your email. Enter the code to confirm.'
                      : 'We\'ll text a one-time code to your phone. Enter your number below, then the code to confirm.'}
                  </p>
                  {setupMethod === 'sms_otp' && (
                    <Input
                      label="Phone number (with country code)"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+15551234567"
                      inputMode="tel"
                    />
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setSetupMethod('totp')}>Back</Button>
                    <Button
                      loading={setupMethod === 'email_otp' ? startEmailSetup.isPending : startSmsSetup.isPending}
                      disabled={setupMethod === 'sms_otp' && phoneNumber.trim().length < 7}
                      onClick={sendRequestCode}
                    >
                      Send code
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Input
                    label="Enter the 6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    error={error ? error : undefined}
                    className="font-mono tracking-widest"
                  />
                  <div className="flex items-center justify-between">
                    <Button size="sm" variant="ghost" onClick={sendRequestCode} loading={setupMethod === 'email_otp' ? startEmailSetup.isPending : startSmsSetup.isPending}>
                      Resend code
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => { setResent(false); setCode(''); }}>Back</Button>
                      <Button loading={setupMethod === 'email_otp' ? verifyEmailSetup.isPending : verifySmsSetup.isPending} disabled={code.length !== 6} onClick={confirmCode}>
                        Enable & continue
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Regenerate recovery codes modal */}
      <Modal open={mode === 'codes'} onClose={() => setMode(null)} title="Regenerate recovery codes" size="md">
        <div className="space-y-4">
          {newCodes ? (
            <>
              <div className="flex items-start gap-2 rounded-lg bg-warning-50 px-4 py-3 text-xs text-warning-600 dark:bg-warning-500/10 dark:text-warning">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Your old recovery codes no longer work. Each new code can be used only once, so store these in a
                  safe place.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                {newCodes.map((rc) => (
                  <code key={rc} className="font-mono text-xs text-slate-600">{rc}</code>
                ))}
              </div>
              <Button
                variant="outline"
                fullWidth
                icon={copied === 'recovery' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={() => copyText(newCodes.join('\n'), 'recovery')}
              >
                Copy recovery codes
              </Button>
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setMode(null)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Enter your current authenticator code to generate a fresh set of recovery codes.
              </p>
              {error && <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">{error}</div>}
              <Input
                label="Authentication code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                className="font-mono tracking-widest"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                <Button loading={regenerate.isPending} disabled={code.length !== 6} onClick={() => regenerate.mutate()}>
                  Generate new codes
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Disable modal */}
      <Modal open={mode === 'disable'} onClose={() => setMode(null)} title="Disable two-factor authentication" size="sm">
        <div className="space-y-4">
          {mfaMethod && mfaMethod !== 'totp' ? (
            <>
              <p className="text-sm text-slate-500">
                A fresh verification code will be sent to your {mfaMethod === 'email_otp' ? 'email' : 'phone'}. Enter it to
                confirm disabling. Your account will go back to password-only sign-in.
              </p>
              {error && <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">{error}</div>}
              {resent && (
                <div className="rounded-lg border border-success-100 bg-success-100/40 px-4 py-3 text-sm text-success-600">
                  A verification code has been sent.
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={startEmailSetup.isPending || startSmsSetup.isPending}
                  disabled={mfaMethod === 'sms_otp' && phoneNumber.trim().length < 7}
                  onClick={() => {
                    if (mfaMethod === 'email_otp') startEmailSetup.mutate();
                    else if (mfaMethod === 'sms_otp') startSmsSetup.mutate();
                  }}
                >
                  {resent ? 'Resend code' : 'Send code'}
                </Button>
              </div>
              {mfaMethod === 'sms_otp' && (
                <Input
                  label="Phone number (with country code)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+15551234567"
                  inputMode="tel"
                />
              )}
              <Input
                label="Verification code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                className="font-mono tracking-widest"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Enter your authenticator code or a recovery code to confirm. Your account will go back to password-only
                sign-in.
              </p>
              {error && <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">{error}</div>}
              <Input
                label="Authentication or recovery code"
                value={code}
                onChange={(e) => setCode(e.target.value.trim().toUpperCase().slice(0, 14))}
                placeholder="000000"
                className="font-mono tracking-widest"
              />
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
            <Button variant="danger" loading={disable.isPending} disabled={code.length < 6} onClick={() => disable.mutate()}>
              Disable
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

const MethodCard = ({
  selected,
  icon,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
      selected
        ? 'border-primary-500 bg-primary-50/60 dark:border-primary-400 dark:bg-primary-500/10'
        : 'border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-500/50'
    }`}
  >
    <span className={`rounded-lg p-2 ${selected ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
    <span>
      <span className="block text-sm font-semibold text-dark">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
    </span>
  </button>
);
