import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/ui/Card';
import { RoleBadge, ActiveBadge, StatusBadge, VerificationBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { formatBytes, formatDate, fileExtension } from '@/utils/format';

export const AdminUserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const detail = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => adminService.userDetail(id!),
    enabled: !!id,
  });

  const documents = useQuery({
    queryKey: ['admin', 'documents', { userId: id, page, search }],
    queryFn: () =>
      adminService.documents({
        userId: id,
        page,
        limit: 10,
        search: search || undefined,
      }),
    enabled: !!id,
  });

  const user = detail.data?.user;
  const stats = detail.data?.stats;
  const rows = documents.data?.documents ?? [];
  const pagination = documents.data?.pagination;

  return (
    <div className="space-y-5 animate-fade-in">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      {detail.isLoading ? (
        <Card className="h-44 animate-pulse bg-slate-100">
          <span className="sr-only">Loading user</span>
        </Card>
      ) : detail.isError || !user ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Could not load this user.
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="h-20 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500" />
            <div className="-mt-9 px-6 pb-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-dark text-xl font-bold text-white shadow-md">
                    {user.fullName.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="pb-1">
                    <h2 className="text-xl font-bold text-dark">{user.fullName}</h2>
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Mail className="h-3.5 w-3.5" /> {user.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <RoleBadge role={user.role} />
                  <ActiveBadge isActive={user.isActive} />
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Wallet</dt>
                    <dd className="font-mono text-xs text-dark">
                      {user.walletAddress
                        ? `${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}`
                        : 'Not linked'}
                    </dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Joined</dt>
                    <dd className="text-sm font-medium text-dark">{formatDate(user.createdAt)}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
                    <dd className="text-sm font-medium text-dark">
                      {user.emailVerified ? 'Verified' : 'Not verified'}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Documents" value={stats?.totalDocuments ?? 0} />
            <Stat label="Confirmed" value={stats?.confirmed ?? 0} tone="success" />
            <Stat label="Pending" value={stats?.pending ?? 0} tone="warning" />
            <Stat label="Encrypted" value={stats?.encrypted ?? 0} tone="primary" />
            <Stat label="Verifications" value={stats?.verifications ?? 0} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-dark">
                <FileText className="h-4 w-4 text-primary-500" /> Documents uploaded by {user.fullName}
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                All documents owned by this user. End-to-end encrypted files can be inspected but
                not decrypted by admins.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
              className="relative w-full sm:max-w-xs"
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search this user's documents..."
                aria-label="Search user documents"
                className="input-base pl-9"
              />
            </form>
          </div>

          <Card className="overflow-hidden">
            {documents.isLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-7 w-7" />}
                title="No documents found"
                message={
                  search
                    ? 'No documents match this search.'
                    : 'This user has not uploaded any documents yet.'
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead className="border-b border-slate-100 bg-slate-50/60">
                      <tr>
                        <th className="table-th">Document</th>
                        <th className="table-th">Fingerprint</th>
                        <th className="table-th">Size</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Integrity</th>
                        <th className="table-th">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.map((doc) => (
                        <tr key={doc._id} className="transition-colors hover:bg-slate-50/70">
                          <td className="table-td max-w-[220px]">
                            <Link
                              to={`/documents/${doc._id}`}
                              className="flex items-center gap-2.5"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 font-mono text-[10px] font-bold text-primary-500">
                                {fileExtension(doc.originalName).slice(0, 4)}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5 truncate font-medium text-dark hover:text-primary-600">
                                  {doc.originalName}
                                  {doc.encryption && (
                                    <Lock className="h-3 w-3 shrink-0 text-primary-500" />
                                  )}
                                </span>
                                <span className="block text-[11px] text-slate-400">
                                  {doc.encryption ? 'End-to-end encrypted' : 'Standard'}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="table-td">
                            <HashDisplay value={doc.sha256Hash} head={8} tail={6} />
                          </td>
                          <td className="table-td whitespace-nowrap">{formatBytes(doc.fileSize)}</td>
                          <td className="table-td">
                            <StatusBadge status={doc.blockchainStatus} />
                          </td>
                          <td className="table-td">
                            <VerificationBadge status={doc.verificationStatus} />
                          </td>
                          <td className="table-td whitespace-nowrap text-slate-500">
                            {formatDate(doc.uploadedAt)}
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
        </>
      )}
    </div>
  );
};

const Stat = ({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'success' | 'warning' | 'primary';
}) => {
  const tones = {
    slate: 'text-dark',
    success: 'text-success-600',
    warning: 'text-warning-600',
    primary: 'text-primary-600',
  } as const;
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  );
};

