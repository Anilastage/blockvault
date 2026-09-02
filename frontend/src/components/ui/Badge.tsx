import type { BlockchainStatus, VerificationResult, VerificationStatus, UserRole } from '@/types';

const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';

export const StatusBadge = ({ status }: { status: BlockchainStatus }) => {
  const map: Record<BlockchainStatus, { cls: string; label: string }> = {
    CONFIRMED: {
      cls: 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success',
      label: 'Confirmed',
    },
    PENDING: {
      cls: 'bg-warning-100 text-warning-600 dark:bg-warning-500/10 dark:text-warning',
      label: 'Pending',
    },
    FAILED: {
      cls: 'bg-danger-100 text-danger dark:bg-danger-500/10 dark:text-danger',
      label: 'Failed',
    },
  };
  const s = map[status] ?? map.PENDING;
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
};

export const VerificationBadge = ({ status }: { status: VerificationStatus | VerificationResult }) => {
  const map: Record<string, { cls: string; label: string }> = {
    VERIFIED: {
      cls: 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success',
      label: 'Verified',
    },
    MODIFIED: {
      cls: 'bg-danger-100 text-danger dark:bg-danger-500/10 dark:text-danger',
      label: 'Modified',
    },
    NOT_FOUND: {
      cls: 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
      label: 'Not Found',
    },
    UNVERIFIED: {
      cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      label: 'Unverified',
    },
  };
  const s = map[status] ?? map.UNVERIFIED;
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
};

export const RoleBadge = ({ role }: { role: UserRole }) => (
  <span
    className={`${base} ${
      role === 'ADMIN'
        ? 'bg-secondary-100 text-purple-700 dark:bg-secondary-500/10 dark:text-secondary'
        : 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400'
    }`}
  >
    {role}
  </span>
);

export const ActiveBadge = ({ isActive }: { isActive: boolean }) => (
  <span
    className={`${base} ${
      isActive
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
    {isActive ? 'Active' : 'Disabled'}
  </span>
);
