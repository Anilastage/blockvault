import { Link } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const NotFoundPage = () => (
  <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-dark px-4 text-center">
    {/* Subtle chain-link / document visual built from gradients + SVG */}
    <div
      className="pointer-events-none absolute inset-0 opacity-50"
      style={{
        background:
          'radial-gradient(500px circle at 25% 30%, rgba(99,102,241,0.25), transparent 60%), radial-gradient(600px circle at 75% 70%, rgba(6,182,212,0.18), transparent 60%)',
      }}
    />
    <svg
      className="pointer-events-none absolute -right-16 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rotate-12 opacity-[0.07]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1"
      aria-hidden="true"
    >
      <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
      <path d="M12 8l3.5 2v4L12 16l-3.5-2v-4L12 8z" strokeLinejoin="round" />
    </svg>

    <div className="relative animate-fade-in">
      <h1 className="bg-gradient-to-b from-white to-slate-500 bg-clip-text text-8xl font-extrabold tracking-tight text-transparent sm:text-9xl">
        404
      </h1>
      <p className="mt-2 text-xl font-semibold text-slate-200">Page Not Found</p>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/dashboard" className="w-full sm:w-auto">
          <Button size="lg" fullWidth className="sm:w-auto" icon={<LayoutDashboard className="h-4 w-4" />}>
            Back to Dashboard
          </Button>
        </Link>
        <Link to="/" className="w-full sm:w-auto">
          <Button
            size="lg"
            variant="outline"
            fullWidth
            className="border-white/25 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
            icon={<Home className="h-4 w-4" />}
          >
            Go Home
          </Button>
        </Link>
      </div>
    </div>
  </div>
);
