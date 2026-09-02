import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  FileText,
  ShieldCheck,
  Boxes,
  XCircle,
  ArrowUpRight,
} from 'lucide-react';
import { adminService } from '@/services/adminService';
import { Card, StatCard } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';
import { VerificationBadge } from '@/components/ui/Badge';
import { UserGrowthChart, VerificationResultPie } from '@/components/dashboard/Charts';
import { formatDateTime } from '@/utils/format';

export const AdminDashboardPage = () => {
  const analytics = useQuery({ queryKey: ['admin', 'analytics'], queryFn: adminService.analytics });
  const stats = analytics.data?.stats;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Users" value={stats?.totalUsers ?? 0} loading={analytics.isLoading} icon={<Users className="h-5 w-5" />} accentClass="bg-primary-500" subtitle={`${stats?.activeUsers ?? 0} active`} />
        <StatCard title="Active Users" value={stats?.activeUsers ?? 0} loading={analytics.isLoading} icon={<UserCheck className="h-5 w-5" />} accentClass="bg-success" />
        <StatCard title="Total Documents" value={stats?.totalDocuments ?? 0} loading={analytics.isLoading} icon={<FileText className="h-5 w-5" />} accentClass="bg-secondary-500" />
        <StatCard title="Total Verifications" value={stats?.totalVerifications ?? 0} loading={analytics.isLoading} icon={<ShieldCheck className="h-5 w-5" />} accentClass="bg-accent-600" />
        <StatCard title="Blockchain Transactions" value={stats?.blockchainTransactions ?? 0} loading={analytics.isLoading} icon={<Boxes className="h-5 w-5" />} accentClass="bg-dark" />
        <StatCard
          title="Failed / Pending"
          value={`${stats?.failedTransactions ?? 0} / ${stats?.pendingTransactions ?? 0}`}
          loading={analytics.isLoading}
          icon={<XCircle className="h-5 w-5" />}
          accentClass="bg-danger"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <h3 className="mb-4 font-semibold text-dark">Registration & Upload Trends</h3>
          {analytics.isLoading ? (
            <Skeleton className="h-[280px]" />
          ) : (
            <UserGrowthChart data={analytics.data?.timeline ?? []} />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-dark">Document Integrity</h3>
          {analytics.isLoading ? (
            <Skeleton className="h-[280px]" />
          ) : ((analytics.data?.documentIntegrity ?? []).every((d) => d.value === 0) ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">
              No documents yet.
            </div>
          ) : (
            <VerificationResultPie data={analytics.data?.documentIntegrity ?? []} />
          ))}
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-dark">Recent System Activity</h3>
          <Link to="/admin/activity" className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500">
            Full log <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {analytics.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="table-th">Action</th>
                  <th className="table-th">User</th>
                  <th className="table-th">Detail</th>
                  <th className="table-th">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(analytics.data?.recentActivity ?? []).map((log) => (
                  <tr key={log._id}>
                    <td className="table-td">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      {typeof log.userId === 'object' && log.userId ? log.userId.email : 'System'}
                    </td>
                    <td className="table-td max-w-[260px] truncate text-slate-500">
                      {typeof log.metadata?.name === 'string' ? log.metadata.name : (log.entityType ?? '')}
                    </td>
                    <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Integrity legend note */}
      <p className="text-center text-xs text-slate-400">
        Document integrity reflects the latest verification outcome per document.
        <VerificationBadge status="VERIFIED" /> means the hash matched its blockchain record.
      </p>
    </div>
  );
};
