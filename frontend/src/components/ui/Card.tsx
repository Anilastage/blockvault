import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card = ({ children, className = '', hover }: CardProps) => (
  <div
    className={`card ${hover ? 'transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5' : ''} ${className}`}
  >
    {children}
  </div>
);

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  accentClass?: string;
  subtitle?: string;
  loading?: boolean;
}

export const StatCard = ({ title, value, icon, accentClass = 'bg-primary-500', subtitle, loading }: StatCardProps) => (
  <Card hover className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        {loading ? (
          <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ) : (
          <p className="mt-1 text-2xl font-bold tracking-tight text-dark dark:text-white">{value}</p>
        )}
        {subtitle && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${accentClass}`}>
        {icon}
      </div>
    </div>
  </Card>
);
