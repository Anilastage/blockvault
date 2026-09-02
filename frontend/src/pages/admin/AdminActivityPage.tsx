import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/ui/Card';
import { RoleBadge } from '@/components/ui/Badge';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { formatDateTime } from '@/utils/format';

const ACTIONS = [
  'ALL',
  'REGISTER',
  'LOGIN',
  'LOGOUT',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DELETE',
  'BLOCKCHAIN_REGISTER',
  'DOCUMENT_VERIFY',
  'PROFILE_UPDATE',
  'ADMIN_CHANGE_ROLE',
  'ADMIN_DISABLE_USER',
] as const;

const actionTone: Record<string, string> = {
  LOGIN: 'bg-primary-50 text-primary-600',
  LOGOUT: 'bg-slate-100 text-slate-500',
  REGISTER: 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success',
  DOCUMENT_UPLOAD: 'bg-accent-100 text-accent-600 dark:bg-accent-500/10 dark:text-accent',
  DOCUMENT_DELETE: 'bg-danger-100 text-danger dark:bg-danger-500/10 dark:text-danger',
  BLOCKCHAIN_REGISTER: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
  DOCUMENT_VERIFY: 'bg-secondary-100 text-purple-600 dark:bg-secondary-500/10 dark:text-secondary',
  PROFILE_UPDATE: 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
};

export const AdminActivityPage = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [action, setActionFilter] = useState<string>('ALL');

  const logs = useQuery({
    queryKey: ['admin', 'activity', { page, action }],
    queryFn: () =>
      adminService.activityLogs({
        page,
        limit: 15,
        action: action || undefined,
      }),
  });

  const rows = logs.data?.logs ?? [];
  const pagination = logs.data?.pagination;

  const filteredRows = useMemo(
    () =>
      rows.filter((log) =>
        searchInput
          ? log.action.toLowerCase().includes(searchInput.toLowerCase()) ||
            (typeof log.metadata?.name === 'string' &&
              log.metadata.name.toLowerCase().includes(searchInput.toLowerCase()))
          : true
      ),
    [rows, searchInput]
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter visible actions below..."
            aria-label="Quick filter actions"
            className="input-base pl-9"
          />
        </div>
        <select
          value={action}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by action"
          className="input-base !w-auto !py-2 text-sm"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a === 'ALL' ? 'All actions' : a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {logs.isLoading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-7 w-7" />}
            title="No activity recorded"
            message={action !== 'ALL' || searchInput ? 'No entries match this filter.' : 'System activity will appear here as users interact with BlockVault.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Action</th>
                    <th className="table-th">User</th>
                    <th className="table-th">Entity</th>
                    <th className="table-th">Detail</th>
                    <th className="table-th">IP</th>
                    <th className="table-th">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRows
                    .map((log) => (
                      <tr key={log._id} className="transition-colors hover:bg-slate-50/70">
                        <td className="table-td whitespace-nowrap">
                          <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${actionTone[log.action] ?? 'bg-slate-100 text-slate-500'}`}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="table-td whitespace-nowrap">
                          {typeof log.userId === 'object' && log.userId ? (
                            <span>
                              <span className="block font-medium text-dark">{log.userId.fullName}</span>
                              <RoleBadge role={log.userId.role} />
                            </span>
                          ) : (
                            <span className="text-slate-400">Anonymous</span>
                          )}
                        </td>
                        <td className="table-td text-slate-500">{log.entityType ?? '—'}</td>
                        <td className="table-td max-w-[240px] truncate text-slate-500">
                          {typeof log.metadata?.name === 'string'
                            ? log.metadata.name
                            : typeof log.metadata?.email === 'string'
                              ? log.metadata.email
                              : typeof log.metadata?.hash === 'string'
                                ? `${log.metadata.hash.slice(0, 16)}…`
                                : '—'}
                        </td>
                        <td className="table-td font-mono text-xs text-slate-400">{log.ipAddress ?? '—'}</td>
                        <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(log.createdAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {pagination && <PaginationControls pagination={pagination} onPageChange={setPage} />}
          </>
        )}
      </Card>
    </div>
  );
};
