import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = ({ icon, title, message, actionLabel, onAction }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-in">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-primary-500/10 dark:text-primary-400">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-dark dark:text-white">{title}</h3>
    <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
    {actionLabel && onAction && (
      <Button className="mt-5" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`} />
);

export const TableSkeleton = ({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-3 p-4">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={`h-9 ${c === 0 ? 'w-1/3' : 'flex-1'}`} />
        ))}
      </div>
    ))}
  </div>
);

export const Spinner = ({ className = 'h-6 w-6 text-primary-500' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);
