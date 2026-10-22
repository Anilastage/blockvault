import { NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

const publicNav = [
  { to: '/', label: 'Home' },
];

export const PublicLayout = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-secondary-500">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
                <path d="M9 11.5h6M9 14.5h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight text-dark dark:text-white">
              Block<span className="text-primary-500">Vault</span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {publicNav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-600' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isAuthenticated ? (
              <Button size="sm" onClick={() => (isAdmin ? window.location.assign('/admin') : window.location.assign('/dashboard'))}>
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => (window.location.href = '/login')}>
                  Sign in
                </Button>
                <Button size="sm" onClick={() => (window.location.href = '/register')}>
                  Get Started
                </Button>
              </>
            )}
          </div>

          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="animate-fade-in border-t border-slate-100 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {publicNav.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? 'bg-primary-50 text-primary-600' : 'text-slate-600'
                    }`
                  }
                  onClick={() => setOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
              <div className="mt-2 flex gap-2 border-t border-slate-100 pt-3">
                {isAuthenticated ? (
                  <Button fullWidth size="sm" onClick={() => (window.location.href = '/dashboard')}>
                    Dashboard
                  </Button>
                ) : (
                  <>
                    <Button fullWidth variant="outline" size="sm" onClick={() => (window.location.href = '/login')}>
                      Sign in
                    </Button>
                    <Button fullWidth size="sm" onClick={() => (window.location.href = '/register')}>
                      Get Started
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-center text-sm text-slate-400">
            © {new Date().getFullYear()} BlockVault — Blockchain-Based Document Verification
          </p>
        </div>
      </footer>
    </div>
  );
};
