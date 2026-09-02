import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  UserCircle2,
  Settings,
  Wallet,
  Unplug,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { initials } from '@/utils/format';

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

export const Topbar = ({ title, onMenuClick }: TopbarProps) => {
  const { user, logout } = useAuth();
  const wallet = useWallet();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: unreadCount = 0 } = useUnreadCount();

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const goSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q') as string;
    if (q?.trim()) navigate(`/documents?search=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="truncate text-base font-semibold text-dark sm:text-lg dark:text-white">{title}</h1>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Search */}
          <form onSubmit={goSearch} className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              name="q"
              placeholder="Search documents..."
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-all placeholder-slate-400 focus:w-64 focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-primary-500 dark:focus:bg-slate-800 dark:focus:ring-primary-900/40 lg:w-56"
            />
          </form>

          {/* Wallet */}
          {wallet.isConnected ? (
            <div className="flex items-center gap-2">
              {wallet.account && !wallet.isCorrectNetwork && (
                <button
                  onClick={wallet.switchToExpectedNetwork}
                  className="hidden items-center gap-1.5 rounded-lg bg-warning-100 px-3 py-2 text-xs font-semibold text-warning-600 transition-colors hover:bg-orange-200 dark:bg-warning-500/10 dark:text-warning dark:hover:bg-orange-500/20 sm:flex"
                  title="Switch to the configured network"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Wrong network — switch
                </button>
              )}
              <span className="hidden rounded-lg bg-primary-50 px-3 py-2 font-mono text-xs font-semibold text-primary-600 dark:bg-primary-500/10 dark:text-primary-300 sm:block">
                {wallet.shortAccount || 'Connected'}
              </span>
            </div>
          ) : (
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="flex items-center gap-1.5 rounded-lg bg-dark px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-dark-800 disabled:opacity-60 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              <Wallet className="h-3.5 w-3.5" />
              {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Notifications */}
          <button
            onClick={() => navigate('/notifications')}
            className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Profile menu"
            >
              {user?.profileImage ? (
                <img src={user.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-xs font-bold text-white">
                  {initials(user?.fullName ?? 'U')}
                </span>
              )}
              <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </button>

            {menuOpen && (
              <div className="animate-fade-in absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <p className="truncate text-sm font-semibold text-dark dark:text-white">{user?.fullName}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <UserCircle2 className="h-4 w-4" /> Profile
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </button>
                  {wallet.isConnected && (
                    <button
                      onClick={() => { wallet.disconnect(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <Unplug className="h-4 w-4" /> Disconnect wallet
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger-100/60 dark:hover:bg-danger-500/10"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
