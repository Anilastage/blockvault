import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Upload,
  Download,
  Trash2,
  Eye,
  Link2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { documentService } from '@/services/documentService';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, VerificationBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { EmptyState, Spinner, TableSkeleton } from '@/components/ui/Feedback';
import { PaginationControls } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { useWallet } from '@/context/WalletContext';
import { getApiErrorMessage } from '@/services/api';
import { formatBytes, formatDate, fileExtension } from '@/utils/format';
import { registerHashOnChain, isRegisterFailure, failureMessage } from '@/utils/blockchainRegistration';
import type { DocumentItem } from '@/types';

const filters = [
  { value: '', label: 'All' },
  { value: 'CONFIRMED', label: 'Verified' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
];

export const DocumentsPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const page = parseInt(params.get('page') ?? '1', 10);
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['documents', { page, search, status }],
    queryFn: () => documentService.list({ page, limit: 10, search, status: status || undefined }),
  });

  const detail = useQuery({
    queryKey: ['document', detailId],
    queryFn: () => documentService.get(detailId!),
    enabled: !!detailId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentService.remove(id),
    onSuccess: async () => {
      toast('Document deleted. The blockchain record remains permanent.', 'success');
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Delete failed'),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      documentService.download(id, name),
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Download failed'),
  });

  const reportRegisterError = (err: unknown) => {
    if (!isRegisterFailure(err)) {
      toast(getApiErrorMessage(err), 'error', 'Registration failed');
      return;
    }
    if (err.kind === 'network') {
      toast('Wrong network. Switch your wallet to the expected network and try again.', 'warning');
      void wallet.switchToExpectedNetwork();
      return;
    }
    if (err.kind === 'duplicate') {
      toast(failureMessage(err), 'error', 'Already registered');
      return;
    }
    if (err.kind === 'contract') {
      toast(err.message, 'error', 'Contract not configured');
      return;
    }
    toast(err.message, 'error', 'Registration failed');
  };

  const registerMutation = useMutation({
    mutationFn: async (doc: DocumentItem) => {
      const { transactionHash, blockNumber } = await registerHashOnChain(wallet, {
        hash: doc.sha256Hash,
        originalName: doc.originalName,
      });
      return documentService.register(doc._id, { transactionHash, blockNumber });
    },
    onSuccess: async () => {
      toast('Document registered on the blockchain.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: reportRegisterError,
  });

  const pendingDocs = (query.data?.documents ?? []).filter(
    (d) => d.blockchainStatus === 'PENDING'
  );

  const batchRegister = async () => {
    if (!wallet.isConnected) {
      toast('Connect your wallet, then register all pending documents.', 'warning');
      return;
    }
    if (pendingDocs.length === 0) return;
    let done = 0;
    for (const doc of pendingDocs) {
      try {
        await registerMutation.mutateAsync(doc);
        done++;
      } catch {
        break;
      }
    }
    toast(
      `Registered ${done} of ${pendingDocs.length} pending document${pendingDocs.length === 1 ? '' : 's'}.`,
      done === pendingDocs.length ? 'success' : 'warning'
    );
  };

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const documents = query.data?.documents ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateParam('search', searchInput.trim());
          }}
          className="relative flex-1 sm:max-w-sm"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, hash or transaction..."
            className="input-base pl-9"
          />
        </form>
        <div className="flex items-center gap-2">
          {pendingDocs.length > 0 && (
            <Button
              variant="outline"
              icon={<Zap className="h-4 w-4" />}
              disabled={registerMutation.isPending}
              onClick={() => void batchRegister()}
            >
              Register All Pending ({pendingDocs.length})
            </Button>
          )}
          <Link to="/upload">
            <Button icon={<Upload className="h-4 w-4" />}>Upload Document</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => updateParam('status', f.value)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              status === f.value
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-primary-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table / cards */}
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : documents.length === 0 ? (
          search || status ? (
            <EmptyState
              icon={<Search className="h-7 w-7" />}
              title="No documents found"
              message="No documents match your current search or filter. Try adjusting them."
            />
          ) : (
            <EmptyState
              icon={<FileText className="h-7 w-7" />}
              title="No documents yet"
              message="Upload your first document to start protecting it with blockchain verification."
              actionLabel="Upload Document"
              onAction={() => navigate('/upload')}
            />
          )
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Document</th>
                    <th className="table-th">Fingerprint</th>
                    <th className="table-th">Size</th>
                    <th className="table-th">Blockchain</th>
                    <th className="table-th">Integrity</th>
                    <th className="table-th">Uploaded</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {documents.map((doc) => (
                    <tr key={doc._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td max-w-[220px]">
                        <button
                          onClick={() => setDetailId(doc._id)}
                          className="flex items-center gap-2.5 text-left"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 font-mono text-[10px] font-bold text-primary-500">
                            {fileExtension(doc.originalName).slice(0, 4)}
                          </span>
                          <span className="truncate font-medium text-dark hover:text-primary-600">
                            {doc.originalName}
                          </span>
                        </button>
                      </td>
                      <td className="table-td"><HashDisplay value={doc.sha256Hash} /></td>
                      <td className="table-td whitespace-nowrap">{formatBytes(doc.fileSize)}</td>
                      <td className="table-td"><StatusBadge status={doc.blockchainStatus} /></td>
                      <td className="table-td"><VerificationBadge status={doc.verificationStatus} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDate(doc.uploadedAt)}</td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconAction title="View details" onClick={() => setDetailId(doc._id)}>
                            <Eye className="h-4 w-4" />
                          </IconAction>
                          {doc.blockchainStatus === 'PENDING' && (
                            <IconAction title="Register on blockchain" onClick={() => registerMutation.mutate(doc)}>
                              <Zap className="h-4 w-4" />
                            </IconAction>
                          )}
                          {doc.transactionHash && (
                            <IconAction title="Blockchain Receipt" onClick={() => setDetailId(doc._id)}>
                              <Link2 className="h-4 w-4" />
                            </IconAction>
                          )}
                          <IconAction
                            title="Download"
                            onClick={() =>
                              downloadMutation.mutate({ id: doc._id, name: doc.originalName })
                            }
                          >
                            <Download className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Verify now" onClick={() => navigate(`/verify?document=${doc._id}`)}>
                            <ShieldCheck className="h-4 w-4" />
                          </IconAction>
                          <IconAction title="Delete" danger onClick={() => setDeleteTarget(doc._id)}>
                            <Trash2 className="h-4 w-4" />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 lg:hidden">
              {documents.map((doc) => (
                <li key={doc._id} className="p-4">
                  <button className="w-full text-left" onClick={() => setDetailId(doc._id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-dark">{doc.originalName}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatBytes(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                        </p>
                        <div className="mt-2"><HashDisplay value={doc.sha256Hash} head={10} tail={8} /></div>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={doc.blockchainStatus} />
                    <VerificationBadge status={doc.verificationStatus} />
                    <span className="ml-auto flex items-center gap-0.5">
                      {doc.blockchainStatus === 'PENDING' && (
                        <IconAction title="Register on blockchain" onClick={() => registerMutation.mutate(doc)}>
                          <Zap className="h-4 w-4" />
                        </IconAction>
                      )}
                      <IconAction title="Download" onClick={() => downloadMutation.mutate({ id: doc._id, name: doc.originalName })}>
                        <Download className="h-4 w-4" />
                      </IconAction>
                      <IconAction title="Verify" onClick={() => navigate(`/verify?document=${doc._id}`)}>
                        <ShieldCheck className="h-4 w-4" />
                      </IconAction>
                      <IconAction title="Delete" danger onClick={() => setDeleteTarget(doc._id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {pagination && <PaginationControls pagination={pagination} onPageChange={(p) => updateParam('page', String(p))} />}
          </>
        )}
      </Card>

      {/* Detail modal */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Document Details" size="lg">
        {detail.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : detail.data ? (
          <dl className="space-y-4">
            <Row label="File name" value={detail.data.originalName} />
            <Row label="Type" value={detail.data.mimeType} />
            <Row label="Size" value={formatBytes(detail.data.fileSize)} />
            <Row
              label="Document Fingerprint"
              value={<HashDisplay value={detail.data.sha256Hash} head={20} tail={18} />}
            />
            <Row label="Blockchain status" value={<StatusBadge status={detail.data.blockchainStatus} />} />
            <Row label="Integrity status" value={<VerificationBadge status={detail.data.verificationStatus} />} />
            {detail.data.transactionHash && (
              <Row
                label="Blockchain Receipt"
                value={<HashDisplay value={detail.data.transactionHash} head={14} tail={12} />}
              />
            )}
            {detail.data.blockNumber !== undefined && (
              <Row label="Recorded in block" value={String(detail.data.blockNumber)} />
            )}
            <Row label="Uploaded" value={formatDate(detail.data.uploadedAt)} />
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  downloadMutation.mutate(
                    { id: detail.data!._id, name: detail.data!.originalName },
                    { onSuccess: () => toast('Download started.', 'success') }
                  );
                }}
                loading={downloadMutation.isPending}
              >
                Download
              </Button>
              {detail.data?.blockchainStatus === 'PENDING' && (
                <Button
                  variant="success"
                  size="sm"
                  icon={<Zap className="h-4 w-4" />}
                  loading={registerMutation.isPending}
                  onClick={() => registerMutation.mutate(detail.data!)}
                >
                  Register
                </Button>
              )}
              <Button size="sm" onClick={() => { setDetailId(null); navigate(`/documents/${detail.data!._id}`); }}>
                Full details
              </Button>
            </div>
          </dl>
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        destructive
        title="Delete document?"
        message="This permanently removes the local file and its metadata. The blockchain registration cannot be removed — the on-chain proof will remain."
        confirmLabel="Delete Document"
        cancelLabel="Keep It"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
};

const IconAction = ({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`rounded-lg p-2 transition-colors ${
      danger ? 'text-slate-400 hover:bg-danger-100/60 hover:text-danger' : 'text-slate-400 hover:bg-primary-50 hover:text-primary-600'
    }`}
  >
    {children}
  </button>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <dt className="shrink-0 text-sm font-medium text-slate-500">{label}</dt>
    <dd className="min-w-0 break-all text-right text-sm text-dark">{value}</dd>
  </div>
);
