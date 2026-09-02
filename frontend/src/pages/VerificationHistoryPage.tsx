import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  ShieldCheck,
  XCircle,
  Percent,
  Search,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { verificationService } from '@/services/verificationService';
import { Card, StatCard } from '@/components/ui/Card';
import { VerificationBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/utils/format';
import type { VerificationRecord } from '@/types';

const resultFilters = [
  { value: 'ALL', label: 'All' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'MODIFIED', label: 'Invalid' },
  { value: 'NOT_FOUND', label: 'Not Found' },
];

const dateFilters = [
  { value: 'ALL', label: 'All Time', days: null },
  { value: 'TODAY', label: 'Today', days: 0 },
  { value: '7D', label: 'Last 7 Days', days: 7 },
  { value: '30D', label: 'Last 30 Days', days: 30 },
] as const;

const daysAgoIso = (days: number | null): string | undefined => {
  if (days === null) return undefined;
  const d = new Date();
  if (days === 0) d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const VerificationHistoryPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [result, setResultFilterValue] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<(typeof dateFilters)[number]['value']>('ALL');
  const [detailId, setDetailId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['verification-history', { page, limit, search, result, dateFilter }],
    queryFn: () =>
      verificationService.history({
        page,
        limit,
        search: search || undefined,
        status: result,
        sortOrder: 'desc',
        from: daysAgoIso(dateFilters.find((d) => d.value === dateFilter)!.days),
      }),
  });

  // Summary is derived from the full history stats endpoint (dashboard stats
  // + current filtered page totals) to avoid loading the entire collection.
  const allStats = useQuery({
    queryKey: ['verification-summary'],
    queryFn: async () => {
      const data = await verificationService.history({ page: 1, limit: 1 });
      return data.pagination.total;
    },
  });

  const verifiedCount = useQuery({
    queryKey: ['verification-summary-verified'],
    queryFn: () =>
      verificationService
        .history({ page: 1, limit: 1, status: 'VERIFIED' })
        .then((d) => d.pagination.total),
  });

  const successRate = useMemo(() => {
    const total = allStats.data ?? 0;
    const ok = verifiedCount.data ?? 0;
    return total === 0 ? '0.0' : ((ok / total) * 100).toFixed(1);
  }, [allStats.data, verifiedCount.data]);

  const records = history.data?.verifications ?? [];
  const pagination = history.data?.pagination;
  const detail: VerificationRecord | undefined = records.find((r) => r._id === detailId);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const hashesMatch =
    detail &&
    detail.blockchainHash &&
    detail.calculatedHash.toLowerCase() === detail.blockchainHash.toLowerCase();

  return (
    <div className="space-y-5 animate-fade-in">
      <p className="-mt-2 text-sm text-slate-500">
        Track every document authenticity verification performed through BlockVault.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Verifications"
          value={allStats.data ?? 0}
          loading={allStats.isLoading}
          icon={<History className="h-5 w-5" />}
          accentClass="bg-primary-500"
        />
        <StatCard
          title="Successful"
          value={verifiedCount.data ?? 0}
          loading={verifiedCount.isLoading}
          icon={<ShieldCheck className="h-5 w-5" />}
          accentClass="bg-success"
        />
        <StatCard
          title="Failed / Not Found"
          value={(allStats.data ?? 0) - (verifiedCount.data ?? 0)}
          loading={allStats.isLoading || verifiedCount.isLoading}
          icon={<XCircle className="h-5 w-5" />}
          accentClass="bg-danger"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          loading={allStats.isLoading || verifiedCount.isLoading}
          icon={<Percent className="h-5 w-5" />}
          accentClass="bg-secondary-500"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={submitSearch} className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search document name or hash..."
            aria-label="Search verification history"
            className="input-base pl-9"
          />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value as never);
              setPage(1);
            }}
            aria-label="Date filter"
            className="input-base !w-auto !py-2 text-sm"
          >
            {dateFilters.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Records per page"
            className="input-base !w-auto !py-2 text-sm"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Result filters */}
      <div className="flex flex-wrap gap-1.5">
        {resultFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setResultFilterValue(f.value);
              setPage(1);
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              result === f.value
                ? 'bg-primary-500 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {history.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : records.length === 0 ? (
          search || result !== 'ALL' || dateFilter !== 'ALL' ? (
            <EmptyState
              icon={<Search className="h-7 w-7" />}
              title="No matching verifications"
              message="Nothing matches your filters — try adjusting them."
            />
          ) : (
            <EmptyState
              icon={<History className="h-7 w-7" />}
              title="No Verification History"
              message="Documents you verify will appear here."
              actionLabel="Verify a Document"
              onAction={() => window.location.assign('/verify')}
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Document</th>
                    <th className="table-th">Fingerprint</th>
                    <th className="table-th">Result</th>
                    <th className="table-th">Verified By</th>
                    <th className="table-th">Blockchain Status</th>
                    <th className="table-th">Date</th>
                    <th className="table-th text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((v) => (
                    <tr key={v._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td max-w-[180px]">
                        <span className="truncate" title={v.documentId?.originalName ?? 'Direct hash check'}>
                          {v.documentId?.originalName ?? '—'}
                        </span>
                      </td>
                      <td className="table-td"><HashDisplay value={v.calculatedHash} head={8} tail={6} /></td>
                      <td className="table-td"><VerificationBadge status={v.result} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">You</td>
                      <td className="table-td">
                        {v.result === 'VERIFIED' ? (
                          <span className="text-xs font-medium text-success-600">On-chain match</span>
                        ) : v.transactionHash ? (
                          <span className="text-xs font-medium text-slate-500">Record exists</span>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">No record</span>
                        )}
                      </td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(v.verifiedAt)}</td>
                      <td className="table-td text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetailId(v._id)} icon={<Eye className="h-3.5 w-3.5" />}>
                          View
                        </Button>
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

      {/* Detail modal */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Verification Details" size="lg">
        {detail && (
          <div className="space-y-4">
            <div
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                detail.result === 'VERIFIED'
                  ? 'border-success-100 bg-success-100/40 dark:border-success-500/20 dark:bg-success-500/10'
                  : detail.result === 'MODIFIED'
                    ? 'border-danger-100 bg-danger-100/40 dark:border-danger-500/20 dark:bg-danger-500/10'
                    : 'border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/10'
              }`}
            >
              {detail.result === 'VERIFIED' ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
              ) : (
                <XCircle className={`h-6 w-6 shrink-0 ${detail.result === 'MODIFIED' ? 'text-danger' : 'text-orange-500'}`} />
              )}
              <div>
                <p className="font-semibold text-dark">
                  {detail.result === 'VERIFIED'
                    ? 'Document Integrity Confirmed'
                    : 'Document Integrity Failed'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {detail.result === 'VERIFIED' &&
                    'The calculated hash matches the permanent blockchain record.'}
                  {detail.result === 'MODIFIED' &&
                    'The calculated hash differs from the registered blockchain hash — this file has changed since registration.'}
                  {detail.result === 'NOT_FOUND' &&
                    'This hash does not exist in the blockchain registry — the document was never registered.'}
                </p>
              </div>
            </div>

            <dl className="space-y-3.5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <Row label="Document Name" value={detail.documentId?.originalName ?? 'Direct hash verification'} />
              <RowMono label="Recorded Fingerprint (on blockchain)" value={detail.blockchainHash ?? 'Not found'} />
              <RowMono label="Checked Fingerprint" value={detail.calculatedHash} />
              <Row label="Verification Result">
                <VerificationBadge status={detail.result} />
              </Row>
              <Row label="Verified At" value={formatDateTime(detail.verifiedAt)} />
              <Row label="Owner Wallet">
                {detail.ownerWallet ? (
                  <HashDisplay value={detail.ownerWallet} head={10} tail={8} />
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Blockchain Receipt">
                {detail.transactionHash ? (
                  <HashDisplay value={detail.transactionHash} head={12} tail={10} />
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Recorded in Block" value={detail.blockNumber ?? '—'} />
              <Row label="Network">
                <Link to="/blockchain" className="text-primary-600 hover:underline">
                  View network status →
                </Link>
              </Row>
            </dl>

            {hashesMatch && (
              <p className="rounded-lg bg-success-100/50 px-4 py-2.5 text-center text-xs font-semibold text-success-600">
                Calculated hash and blockchain hash are identical.
              </p>
            )}
            {!hashesMatch && detail.result === 'MODIFIED' && (
              <p className="rounded-lg bg-danger-100/50 px-4 py-2.5 text-center text-xs font-semibold text-danger">
                Calculated hash and blockchain hash differ.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const Row = ({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <dt className="shrink-0 text-sm font-medium text-slate-500">{label}</dt>
    <dd className="min-w-0 break-all text-right text-sm text-dark">{children ?? value}</dd>
  </div>
);

const RowMono = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 break-all font-mono text-xs text-dark">{value}</dd>
  </div>
);
