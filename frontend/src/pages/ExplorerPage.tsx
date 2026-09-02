import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  FileDigit,
  ShieldCheck,
  Network,
  Copy,
  Check,
  ExternalLink,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { blockchainService } from '@/services/blockchainService';
import { Card, StatCard } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/utils/format';
import type { TxRecord } from '@/types';

const statusFilters = ['ALL', 'CONFIRMED', 'PENDING', 'FAILED'] as const;
const dateFilters = [
  { value: 'ALL', label: 'All Time', days: null },
  { value: 'TODAY', label: 'Today', days: 0 },
  { value: '7D', label: 'Last 7 Days', days: 7 },
  { value: '30D', label: 'Last 30 Days', days: 30 },
] as const;

const daysAgoIso = (days: number | null): string | undefined => {
  if (days === null) return undefined;
  const d = new Date();
  if (days === 0) {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const ExplorerPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof statusFilters)[number]>('ALL');
  const [dateFilter, setDateFilter] = useState<(typeof dateFilters)[number]['value']>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [detail, setDetail] = useState<TxRecord | null>(null);

  const statusInfo = useQuery({
    queryKey: ['blockchain', 'status'],
    queryFn: () => blockchainService.status(),
    refetchInterval: 60_000,
  });

  const transactions = useQuery({
    queryKey: ['blockchain', 'transactions', { page, limit, search, status, sortOrder, dateFilter }],
    queryFn: () =>
      blockchainService.transactions({
        page,
        limit,
        search: search || undefined,
        status,
        sortOrder,
        from: daysAgoIso(dateFilters.find((d) => d.value === dateFilter)!.days),
      }),
  });

  const explorerBase = statusInfo.data?.explorerUrl;
  const txExplorerUrl = detail?.transactionHash
    ? blockchainService.explorerTxUrl(explorerBase, detail.transactionHash)
    : null;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const rows = transactions.data?.transactions ?? [];
  const pagination = transactions.data?.pagination;

  return (
    <div className="space-y-5 animate-fade-in">
      <p className="-mt-2 text-sm text-slate-500">
        Explore document verification records and blockchain transactions.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Registered Documents"
          value={statusInfo.data?.onChainTotalDocuments ?? '—'}
          loading={statusInfo.isLoading}
          icon={<FileDigit className="h-5 w-5" />}
          accentClass="bg-primary-500"
          subtitle={
            statusInfo.data && !statusInfo.data.rpcHealthy ? 'RPC unreachable — showing cached count' : undefined
          }
        />
        <StatCard
          title="Blockchain Transactions"
          value={pagination?.total ?? 0}
          loading={transactions.isLoading}
          icon={<Boxes className="h-5 w-5" />}
          accentClass="bg-secondary-500"
        />
        <StatCard
          title="Verified Documents"
          value={statusInfo.data?.verifiedDocuments ?? 0}
          loading={statusInfo.isLoading}
          icon={<ShieldCheck className="h-5 w-5" />}
          accentClass="bg-success"
        />
        <StatCard
          title="Current Network"
          value={statusInfo.data ? statusInfo.data.networkName.split(' ').slice(0, 2).join(' ') : '—'}
          loading={statusInfo.isLoading}
          icon={<Network className="h-5 w-5" />}
          accentClass="bg-accent-600"
          subtitle={statusInfo.data ? `Network ID ${statusInfo.data.chainId}` : undefined}
        />
      </div>

      {/* Contract card */}
      <ContractCard />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <form onSubmit={submitSearch} className="relative w-full xl:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search transaction, document hash or wallet address..."
            aria-label="Search the blockchain records"
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
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as 'asc' | 'desc');
              setPage(1);
            }}
            aria-label="Sort order"
            className="input-base !w-auto !py-2 text-sm"
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
          <button
            onClick={() => transactions.refetch()}
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition-colors hover:text-primary-600"
            title="Refresh"
            aria-label="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${transactions.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {statusFilters.map((f) => (
          <button
            key={f}
            onClick={() => {
              setStatus(f);
              setPage(1);
            }}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              status === f
                ? 'bg-primary-500 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-primary-300'
            }`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Records per page"
            className="input-base !w-auto !py-1.5 text-xs"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {transactions.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          search || status !== 'ALL' || dateFilter !== 'ALL' ? (
            <EmptyState
              icon={<Search className="h-7 w-7" />}
              title="No matching transactions"
              message="No blockchain records match your filters. Try widening your search."
            />
          ) : (
            <EmptyState
              icon={<Boxes className="h-7 w-7" />}
              title="No Blockchain Activity Yet"
              message="Blockchain transactions will appear here after document hashes are registered."
              actionLabel="Upload Document"
              onAction={() => window.location.assign('/upload')}
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Blockchain Receipt</th>
                    <th className="table-th">Document</th>
                    <th className="table-th">Document Fingerprint</th>
                    <th className="table-th">Owner Wallet</th>
                    <th className="table-th">Block</th>
                    <th className="table-th">Timestamp</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((tx) => (
                    <tr key={tx._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td font-mono text-xs">
                        <HashDisplay value={tx.transactionHash ?? ''} head={8} tail={6} copyable={false} />
                      </td>
                      <td className="table-td max-w-[180px] truncate" title={tx.documentName}>
                        {tx.documentName}
                      </td>
                      <td className="table-td"><HashDisplay value={tx.sha256Hash} head={8} tail={6} /></td>
                      <td className="table-td">
                        {tx.walletAddress ? (
                          <HashDisplay value={tx.walletAddress} head={6} tail={4} copyable={false} mono />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="table-td">{tx.blockNumber ?? '—'}</td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(tx.uploadedAt)}</td>
                      <td className="table-td"><StatusBadge status={tx.blockchainStatus} /></td>
                      <td className="table-td text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetail(tx)} icon={<Eye className="h-3.5 w-3.5" />}>
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
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Transaction Details" size="lg">
        {detail && (
          <div className="space-y-4">
            {!statusInfo.data?.rpcHealthy && (
              <div className="flex items-start gap-2.5 rounded-xl border border-warning-100 bg-warning-100/40 p-3.5 text-sm text-warning-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                The blockchain node is currently unreachable — live on-chain values may be unavailable.
              </div>
            )}
            <dl className="space-y-3.5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <Row label="Blockchain Receipt">
                <span className="break-all font-mono text-xs">{detail.transactionHash}</span>
              </Row>
              <Row label="Document">
                <span>{detail.documentName}</span>
              </Row>
              <Row label="Document Fingerprint">
                <span className="break-all font-mono text-xs">{detail.sha256Hash}</span>
              </Row>
              <Row label="Owner Wallet">
                {detail.walletAddress ? (
                  <span className="font-mono text-xs break-all">{detail.walletAddress}</span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Network">
                <span>
                  {statusInfo.data?.networkName ?? blockchainService.networkName(statusInfo.data?.chainId)}
                </span>
              </Row>
              <Row label="Registration Contract">
                <HashDisplay value={detail.blockchainStatus === 'CONFIRMED' ? statusInfo.data?.contractAddress ?? '' : ''} head={10} tail={8} />
              </Row>
              <Row label="Recorded in Block">
                <span>{detail.blockNumber ?? '—'}</span>
              </Row>
              <Row label="Timestamp">
                <span>{formatDateTime(detail.uploadedAt)}</span>
              </Row>
              <Row label="Blockchain Status">
                <StatusBadge status={detail.blockchainStatus} />
              </Row>
              <Row label="Gas Information">
                <span className="text-xs text-slate-400">
                  Available via the block explorer for this transaction.
                </span>
              </Row>
            </dl>

            <div className="flex flex-wrap gap-2">
              {detail.transactionHash && (
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(detail.transactionHash!)}>
                  Copy Receipt
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(detail.sha256Hash)}>
                Copy Fingerprint
              </Button>
              {txExplorerUrl ? (
                <a href={txExplorerUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" icon={<ExternalLink className="h-4 w-4" />}>
                    Open Blockchain Explorer
                  </Button>
                </a>
              ) : (
                <span className="self-center text-xs text-slate-400">
                  No explorer configured for this network.
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

/** Live contract/network information. */
const ContractCard = () => {
  const status = useQuery({
    queryKey: ['blockchain', 'status'],
    queryFn: () => blockchainService.status(),
  });

  const [copied, setCopied] = useState(false);
  const address = status.data?.contractAddress;

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const explorerAddrUrl =
    address && status.data?.explorerUrl
      ? `${status.data.explorerUrl.replace(/\/$/, '')}/address/${address}`
      : null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-dark">Verification Contract</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            status.data?.rpcHealthy
              ? 'bg-success-100 text-success-600'
              : 'bg-danger-100 text-danger'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.data?.rpcHealthy ? 'bg-success animate-pulse-soft' : 'bg-danger'}`} />
          {status.data?.configured ? (status.data.rpcHealthy ? 'Connected' : 'Unreachable') : 'Not Configured'}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Network" value={status.data?.networkName ?? '—'} />
        <Row label="Network ID" value={status.data ? String(status.data.chainId) : '—'} />
        <Row label="Connected Wallet">
          <Link to="/profile" className="text-primary-600 hover:underline">
            Manage in Profile →
          </Link>
        </Row>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Registration Contract</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            {address ? (
              <>
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs text-dark">
                  {address.slice(0, 10)}...{address.slice(-8)}
                </code>
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
                  aria-label={copied ? 'Copied' : 'Copy contract address'}
                  title="Copy full address"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
                {explorerAddrUrl && (
                  <a
                    href={explorerAddrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                  >
                    Open in Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            ) : (
              <span className="text-sm text-slate-400">
                Not configured — deploy the contract and set CONTRACT_ADDRESS.
              </span>
            )}
          </dd>
        </div>
        <Row
          label="Explorer"
          value={
            status.data?.explorerUrl ? (
              <a
                href={status.data.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:underline"
              >
                {new URL(status.data.explorerUrl).host}
              </a>
            ) : (
              'Not configured'
            )
          }
        />
      </dl>
    </Card>
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
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 text-sm text-dark">{children ?? value}</dd>
  </div>
);
