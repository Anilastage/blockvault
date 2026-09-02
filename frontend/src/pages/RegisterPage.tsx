import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z
  .object({
    fullName: z.string().min(2, 'Please enter your full name').max(100),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain a letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export const RegisterPage = () => {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const user = await register(values);
      toast(`Account created. Welcome to BlockVault, ${user.fullName.split(' ')[0]}!`, 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Registration failed');
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
              'radial-gradient(500px circle at 30% 30%, rgba(139,92,246,0.4), transparent 60%), radial-gradient(600px circle at 70% 75%, rgba(99,102,241,0.3), transparent 60%)',
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
            Your documents,
            <br />
            provably authentic.
          </p>
          <ul className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm text-slate-400">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-500/20 text-center text-xs leading-[20px] text-primary-300">✓</span>
              Register document hashes on-chain with one click
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-500/20 text-center text-xs leading-[20px] text-primary-300">✓</span>
              Detect any modification instantly via digital fingerprint
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-500/20 text-center text-xs leading-[20px] text-primary-300">✓</span>
              Keep a permanent, auditable verification history
            </li>
          </ul>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-md animate-fade-in">
          <h1 className="text-2xl font-bold tracking-tight text-dark">Create your account</h1>
          <p className="mt-1.5 text-sm text-slate-500">Start protecting documents in minutes.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Input
              label="Full name"
              autoComplete="name"
              placeholder="Jane Doe"
              error={errors.fullName?.message}
              {...field('fullName')}
            />
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
              autoComplete="new-password"
              placeholder="••••••••"
              hint="Minimum 8 characters, with letters and numbers."
              error={errors.password?.message}
              {...field('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...field('confirmPassword')}
            />
            <Button type="submit" fullWidth size="lg" loading={isSubmitting} icon={<UserPlus className="h-4 w-4" />}>
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
