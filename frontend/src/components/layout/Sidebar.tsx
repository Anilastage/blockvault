import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Upload,
  ShieldCheck,
  Boxes,
  History,
  BarChart3,
  UserCircle2,
  Settings,
  ShieldHalf,
  Users,
  ScrollText,
  Activity,
  LogOut,
  X,
  Bell,
  KeyRound,
  Share2,
  Download,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const userNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/upload', label: 'Upload Document', icon: Upload },
  { to: '/share', label: 'Share Document', icon: Share2 },
  { to: '/download', label: 'Download by Code', icon: Download },
  { to: '/verify', label: 'Verify Document', icon: ShieldCheck },
  { to: '/verification-history', label: 'Verification History', icon: History },
  { to: '/blockchain', label: 'Blockchain Explorer', icon: Boxes },
  { to: '/access-requests', label: 'Access Requests', icon: KeyRound },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/activity', label: 'Activity Logs', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const accountNav = [
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const adminNav = [
  { to: '/admin', label: 'Admin Dashboard', icon: ShieldHalf },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/documents', label: 'Documents', icon: FileText },
  { to: '/admin/transactions', label: 'Transactions', icon: Boxes },
  { to: '/admin/activity', label: 'Activity Logs', icon: ScrollText },
];

export const Sidebar = ({ open, onClose }: SidebarProps) => {
  const { isAdmin, logout } = useAuth();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-primary-500/15 text-white shadow-[inset_2px_0_0_0_#6366F1]'
        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
    }`;

  const Section = ({ title, items }: { title: string; items: typeof userNav }) => (
    <div className="mt-6">
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <nav className="space-y-0.5">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} onClick={onClose}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-dark/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-dark transition-transform duration-200 ease-in-out lg:w-64 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <NavLink to="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-secondary-500 shadow-md">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
                <path d="M9 11.5h6M9 14.5h4" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight text-white">
              Block<span className="text-primary-400">Vault</span>
            </span>
          </NavLink>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <Section title="Menu" items={userNav} />
          <Section title="Account" items={accountNav} />
          {isAdmin && (
            <Section title="Administration" items={adminNav} />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/10 px-3 py-4">
          <button
            onClick={async () => {
              await logout();
              onClose();
              window.location.href = '/login';
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-danger-500/10 hover:text-danger"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Logout
          </button>
          <div className="mt-2 flex items-center gap-2 px-3 text-xs text-slate-600">
            <Activity className="h-3.5 w-3.5" />
            Secured by Ethereum
          </div>
        </div>
      </aside>
    </>
  );
};
