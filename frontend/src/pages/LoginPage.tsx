import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, ShieldAlert, MailCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useVault } from '@/context/VaultContext';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { User, MfaMethod } from '@/types';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mfaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, 'Enter your authentication code')
    .max(14, 'Invalid authentication code'),
});

type FormValues = z.infer<typeof schema>;
type MfaValues = z.infer<typeof mfaSchema>;

export const LoginPage = () => {
  const { login, completeMfa, completeEmailVerification } = useAuth();
  const vault = useVault();
  const toast = useToast();
  const passwordRef = useRef('');
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();

  const [stage, setStage] = useState<'credentials' | 'mfa' | 'verify-email'>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>('totp');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [serverError, setServerError] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [resending, setResending] = useState(false);

  const goToDashboard = (user: User) => {
    const next =
      location.state?.from ??
      (params.get('next') ?? (user.role === 'ADMIN' ? '/admin' : '/dashboard'));
    navigate(next, { replace: true });
  };

  const prepareVault = (user: User, password: string) => {
    if (!password) return;
    void vault.unlockOrCreate(password, user.id).catch(() => {
      toast(
        'Signed in, but your encryption vault could not be unlocked. Open any encrypted document to try again.',
        'warning',
        'Vault locked'
      );
    });
  };

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const {
    register: mfaField,
    handleSubmit: handleMfaSubmit,
    formState: { errors: mfaErrors, isSubmitting: mfaSubmitting },
  } = useForm<MfaValues>({ resolver: zodResolver(mfaSchema) });

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    passwordRef.current = values.password;
    try {
      const result = await login(values.email, values.password);
      if (result.requiresEmailVerification) {
        setMfaToken(result.mfaToken);
        setDevCode(result.devCode);
        setStage('verify-email');
        return;
      }
      if (result.requiresTwoFactor) {
        setMfaToken(result.mfaToken);
        setMfaMethod(result.method ?? 'totp');
        setDevCode(result.devCode);
        setStage('mfa');
        return;
      }
      prepareVault(result.user, values.password);
      toast(`Welcome back, ${result.user.fullName.split(' ')[0]}!`, 'success');
      goToDashboard(result.user);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setServerError(message);
      toast(message, 'error', 'Login failed');
    }
  };

  const onVerifyEmail = async (values: MfaValues) => {
    setMfaError('');
    try {
      const user = await completeEmailVerification(mfaToken, values.code);
      prepareVault(user, passwordRef.current);
      toast(`Email verified. Welcome back, ${user.fullName.split(' ')[0]}!`, 'success');
      goToDashboard(user);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setMfaError(message);
      toast(message, 'error', 'Verification failed');
    }
  };

  const onResendVerifyCode = async () => {
    if (!mfaToken || resending) return;
    setResending(true);
    try {
      const { devCode: fresh } = await authService.resendVerification(mfaToken);
      setDevCode(fresh);
      toast('A fresh code was sent to your email.', 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Resend failed');
    } finally {
      setResending(false);
    }
  };

  const onMfaSubmit = async (values: MfaValues) => {
    setMfaError('');
    try {
      const user = await completeMfa(mfaToken, values.code);
      prepareVault(user, passwordRef.current);
      toast(`Welcome back, ${user.fullName.split(' ')[0]}!`, 'success');
      goToDashboard(user);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setMfaError(message);
      toast(message, 'error', 'Verification failed');
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-dark lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(500px circle at 30% 30%, rgba(99,102,241,0.4), transparent 60%), radial-gradient(600px circle at 70% 75%, rgba(6,182,212,0.25), transparent 60%)',
          }}
        />
        <div className="relative z-10 max-w-md px-10 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 shadow-lg">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
                <path d="M9 11.5h6M9 14.5h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-2xl font-bold text-white">
              Block<span className="text-primary-400">Vault</span>
            </span>
          </Link>
          <p className="mt-8 text-xl font-semibold leading-snug text-slate-200">
            Verify Every Document.
            <br />
            Trust Every Record.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Cryptographic document fingerprints anchored on an Ethereum-compatible blockchain â€” proof of
            integrity that never expires.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in">
          {stage === 'mfa' || stage === 'verify-email' ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                {stage === 'verify-email' ? <MailCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-dark">
                {stage === 'verify-email' ? 'Verify your email' : 'Two-factor check'}
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {stage === 'verify-email'
                  ? 'Your email still needs to be confirmed. We\'ve sent you a 6-digit code â€” enter it to finish activating your account.'
                  : mfaMethod === 'totp'
                    ? 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.'
                    : mfaMethod === 'email_otp'
                      ? 'We\'ve emailed you a 6-digit code. Enter it to continue.'
                      : 'We\'ve texted you a 6-digit code. Enter it to continue.'}
              </p>

              {devCode && (
                <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
                  <p className="font-semibold text-warning-800">Email delivery not configured</p>
                  <p className="mt-1">
                    SMTP is not set up, so a code couldn&apos;t be emailed. Your development code is{' '}
                    <span className="font-mono text-base font-bold tracking-widest">{devCode}</span>
                  </p>
                </div>
              )}

              <form
                className="mt-7 space-y-4"
                onSubmit={handleMfaSubmit(stage === 'verify-email' ? onVerifyEmail : onMfaSubmit)}
                noValidate
              >
                {mfaError && (
                  <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">
                    {mfaError}
                  </div>
                )}
                <Input
                  label="Authentication code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  error={mfaErrors.code?.message}
                  className="font-mono text-lg tracking-widest"
                  {...mfaField('code')}
                />
                <Button type="submit" fullWidth size="lg" loading={mfaSubmitting} icon={<ShieldAlert className="h-4 w-4" />}>
                  {stage === 'verify-email' ? 'Verify email & sign in' : 'Verify & sign in'}
                </Button>
              </form>

              <div className="mt-6 flex items-center justify-between text-sm">
                {stage === 'verify-email' ? (
                  <button
                    type="button"
                    onClick={onResendVerifyCode}
                    disabled={resending}
                    className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:text-primary-500 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
                    {resending ? 'Resending...' : 'Resend code'}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setStage('credentials')}
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  â† Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-dark">Welcome back</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in to your BlockVault account
                {params.get('expired') && (
                  <span className="mt-1 block font-medium text-warning-600">
                    Your session expired â€” please sign in again.
                  </span>
                )}
              </p>

              <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                {serverError && (
                  <div className="rounded-lg border border-danger-100 bg-danger-100/50 px-4 py-3 text-sm text-danger">
                    {serverError}
                  </div>
                )}
                <Input
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  error={errors.email?.message}
                  {...field('email')}
                />
                <Input
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="�?��?��?��?��?��?��?��?�"
                  error={errors.password?.message}
                  {...field('password')}
                />
                <div className="flex justify-end">
                  <Link
                    to="/recover"
                    className="text-xs font-medium text-primary-600 hover:text-primary-500"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Button type="submit" fullWidth size="lg" loading={isSubmitting} icon={<LogIn className="h-4 w-4" />}>
                  Sign in
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-500">
                  Create one free
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


