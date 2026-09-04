import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText,
  ShieldCheck,
  Clock,
  History,
  Upload,
  ArrowUpRight,
  Wallet,
  PlusCircle,
  FileStack,
} from 'lucide-react';
import { dashboardService } from '@/services/blockchainService';
import { StatCard, Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';
import { VerificationBadge, StatusBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { UploadTrendChart, VerificationResultPie } from '@/components/dashboard/Charts';
import { formatDateTime } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';

const quickActions = [
  { to: '/upload', label: 'Upload Document', icon: Upload },
  { to: '/verify', label: 'Verify Document', icon: ShieldCheck },
  { to: '/documents', label: 'View Documents', icon: FileStack },
];

export const DashboardPage = () => {
  const { user } = useAuth();

  const stats = useQuery({ queryKey: ['dashboard', 'stats'], queryFn: dashboardService.stats });
  const activity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: dashboardService.activity,
  });
  const analytics = useQuery({
    queryKey: ['dashboard', 'analytics'],
    queryFn: dashboardService.analytics,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting + quick actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-dark">
            Welcome back, {user?.fullName.split(' ')[0]} 👋
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Here's what's happening with your documents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}>
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-primary-300 hover:text-primary-600">
                <Icon className="h-4 w-4" />
                {label}
              </button>
            </Link>
          ))}
          {!user?.walletAddress && (
            <Link to="/profile">
              <button className="flex items-center gap-2 rounded-lg bg-dark px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-dark-800 dark:bg-primary-500 dark:hover:bg-primary-600">
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Documents (Network)"
          value={stats.data?.totalDocuments ?? 0}
          loading={stats.isLoading}
          icon={<FileText className="h-5 w-5" />}
          accentClass="bg-primary-500"
        />
        <StatCard
          title="Your Documents"
          value={stats.data?.yourDocuments ?? 0}
          loading={stats.isLoading}
          icon={<FileStack className="h-5 w-5" />}
          accentClass="bg-secondary-500"
        />
        <StatCard
          title="Verified Documents"
          value={stats.data?.verifiedDocuments ?? 0}
          loading={stats.isLoading}
          icon={<ShieldCheck className="h-5 w-5" />}
          accentClass="bg-success"
        />
        <StatCard
          title="Pending Transactions"
          value={stats.data?.pendingTransactions ?? 0}
          loading={stats.isLoading}
          icon={<Clock className="h-5 w-5" />}
          accentClass="bg-warning"
        />
        <StatCard
          title="Verification Attempts"
          value={stats.data?.verificationAttempts ?? 0}
          loading={stats.isLoading}
          icon={<History className="h-5 w-5" />}
          accentClass="bg-accent-600"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-dark">Documents Uploaded</h3>
            <span className="text-xs text-slate-400">Last 30 days</span>
          </div>
          {analytics.isLoading ? (
            <Skeleton className="h-[260px]" />
          ) : (
            <UploadTrendChart data={analytics.data?.timeline ?? []} />
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-dark">Verification Results</h3>
          </div>
          {analytics.isLoading ? (
            <Skeleton className="h-[260px]" />
          ) : ((analytics.data?.verificationResults ?? []).every((r) => r.value === 0) ? (
            <div className="flex h-[260px] flex-col items-center justify-center text-center text-sm text-slate-400">
              <ShieldCheck className="mb-2 h-8 w-8 text-slate-300" />
              No verifications yet.
              <Link to="/verify" className="mt-1 font-medium text-primary-600 hover:underline">
                Verify your first document →
              </Link>
            </div>
          ) : (
            <VerificationResultPie data={analytics.data!.verificationResults} />
          ))}
        </Card>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-dark">Recent Uploads</h3>
            <Link
              to="/documents"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500"
            >
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {activity.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : activity.data && activity.data.recentUploads.length > 0 ? (
            <ul className="divide-y divide-slate-50">
              {activity.data.recentUploads.map((doc) => (
                <li key={doc._id}>
                  <Link
                    to={`/documents/${doc._id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-dark">{doc.originalName}</p>
                      <HashDisplay value={doc.sha256Hash} head={8} tail={6} />
                    </div>
                    <StatusBadge status={doc.blockchainStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center">
              <PlusCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No documents yet.</p>
              <Link to="/upload" className="mt-1 inline-block text-sm font-medium text-primary-600 hover:underline">
                Upload your first document
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-dark">Recent Verifications</h3>
            <Link
              to="/verification-history"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500"
            >
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {activity.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : activity.data && activity.data.recentVerifications.length > 0 ? (
            <ul className="divide-y divide-slate-50">
              {activity.data.recentVerifications.map((v) => (
                <li key={v._id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100 text-purple-600">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dark">
                      {v.documentId?.originalName ?? (v.calculatedHash ? v.calculatedHash.slice(0, 14) + '…' : 'Unknown document')}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(v.verifiedAt)}</p>
                  </div>
                  <VerificationBadge status={v.result as never} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center">
              <History className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No verification attempts yet.</p>
              <Link to="/verify" className="mt-1 inline-block text-sm font-medium text-primary-600 hover:underline">
                Verify a document now
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Activity log strip */}
      {!activity.isLoading && activity.data && activity.data.recentActivity.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-dark">Network Activity</h3>
            <Link
              to="/activity"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500"
            >
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {activity.data.recentActivity.slice(0, 5).map((a) => (
              <div key={a._id} className="flex items-center gap-3 text-sm">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
                  {a.action.replace(/_/g, ' ')}
                </span>
                <span className="max-w-[180px] truncate text-slate-500">
                  {typeof a.metadata?.name === 'string' ? String(a.metadata.name) : ''}
                </span>
                <span className="max-w-[160px] truncate text-xs text-slate-400">
                  {a.userId && typeof a.userId === 'object' && 'email' in a.userId ? a.userId.email : 'System'}
                </span>
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {formatDateTime(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
