import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, Ban, Play, Users } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RoleBadge, ActiveBadge } from '@/components/ui/Badge';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/utils/format';
import type { User } from '@/types';

export const AdminUsersPage = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRoleFilter] = useState('ALL');
  const [status, setStatusFilter] = useState('ALL');
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [statusTarget, setStatusTarget] = useState<User | null>(null);

  const users = useQuery({
    queryKey: ['admin', 'users', { page, search, role, status }],
    queryFn: () =>
      adminService.users({
        page,
        limit: 10,
        search: search || undefined,
        role,
        isActive: status,
      }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
  };

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'USER' | 'ADMIN' }) =>
      adminService.setUserRole(id, role),
    onSuccess: async (_d, vars) => {
      toast(`Role changed to ${vars.role}.`, 'success');
      setRoleTarget(null);
      await invalidate();
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminService.setUserStatus(id, isActive),
    onSuccess: async (_d, vars) => {
      toast(vars.isActive ? 'Account enabled.' : 'Account disabled.', 'success');
      setStatusTarget(null);
      await invalidate();
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error'),
  });

  const rows = users.data?.users ?? [];
  const pagination = users.data?.pagination;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="relative w-full lg:max-w-sm"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email or wallet..."
            aria-label="Search users"
            className="input-base pl-9"
          />
        </form>
        <div className="flex flex-wrap gap-2">
          <select value={role} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} aria-label="Filter by role" className="input-base !w-auto !py-2 text-sm">
            <option value="ALL">All roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select value={status} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Filter by status" className="input-base !w-auto !py-2 text-sm">
            <option value="ALL">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {users.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="No users found"
            message="No accounts match your search or filters."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">User</th>
                    <th className="table-th">Wallet</th>
                    <th className="table-th">Role</th>
                    <th className="table-th">Status</th>
                    <th className="table-th">Joined</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((u) => (
                    <tr key={u.id ?? u._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td">
                        <p className="font-medium text-dark">{u.fullName}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </td>
                      <td className="table-td font-mono text-xs text-slate-500">
                        {u.walletAddress ? `${u.walletAddress.slice(0, 8)}…${u.walletAddress.slice(-6)}` : '—'}
                      </td>
                      <td className="table-td"><RoleBadge role={u.role} /></td>
                      <td className="table-td"><ActiveBadge isActive={u.isActive} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<ShieldCheck className="h-3.5 w-3.5" />}
                            disabled={String(u.id ?? u._id) === String(me?._id ?? me?.id)}
                            onClick={() => {
                              setRoleTarget(u);
                              setNewRole(u.role === 'ADMIN' ? 'USER' : 'ADMIN');
                            }}
                          >
                            Change Role
                          </Button>
                          {u.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="!text-danger hover:!bg-danger-100/60"
                              icon={<Ban className="h-3.5 w-3.5" />}
                            disabled={String(u.id ?? u._id) === String(me?._id ?? me?.id)}
                              onClick={() => setStatusTarget(u)}
                            >
                              Disable
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="!text-success-600 hover:!bg-success-100/60"
                              icon={<Play className="h-3.5 w-3.5" />}
                              onClick={() => statusMutation.mutate({ id: String(u.id ?? u._id), isActive: true })}
                            >
                              Enable
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && <PaginationControls pagination={pagination} onPageChange={setPage} />}
          </>
        )}
      </Card>

      {/* Role confirm */}
      <ConfirmDialog
        open={!!roleTarget}
        title="Change user role?"
        message={`Set ${roleTarget?.fullName}'s role to ${newRole}? ${newRole === 'ADMIN' ? 'They will gain full administrative access.' : ''}`}
        confirmLabel={`Make ${newRole}`}
        loading={roleMutation.isPending}
        onCancel={() => setRoleTarget(null)}
        onConfirm={() => roleTarget && roleMutation.mutate({ id: String(roleTarget.id ?? roleTarget._id), role: newRole })}
      />

      {/* Disable confirm */}
      <ConfirmDialog
        open={!!statusTarget}
        destructive
        title="Disable this account?"
        message={`${statusTarget?.fullName} (${statusTarget?.email}) will no longer be able to sign in until re-enabled.`}
        confirmLabel="Disable Account"
        loading={statusMutation.isPending}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => statusTarget && statusMutation.mutate({ id: String(statusTarget.id ?? statusTarget._id), isActive: false })}
      />
    </div>
  );
};
