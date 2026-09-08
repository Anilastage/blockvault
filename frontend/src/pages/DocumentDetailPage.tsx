import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ShieldCheck,
  Trash2,
  ExternalLink,
  FileText,
  Link2,
  Blocks,
  History as HistoryIcon,
  ScrollText,
  Zap,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { documentService } from '@/services/documentService';
import { accessService } from '@/services/accessService';
import { blockchainService } from '@/services/blockchainService';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, VerificationBadge } from '@/components/ui/Badge';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ShareDownloadCode } from '@/components/documents/ShareDownloadCode';
import { CertificateModal, type CertificateData } from '@/components/documents/CertificateModal';
import { useToast } from '@/context/ToastContext';
import { useWallet } from '@/context/WalletContext';
import { formatBytes, formatDate, formatDateTime } from '@/utils/format';
import { registerHashOnChain, isRegisterFailure, failureMessage } from '@/utils/blockchainRegistration';

export const DocumentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  const document = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentService.get(id!),
    enabled: !!id,
  });

  const verifications = useQuery({
    queryKey: ['document-verifications', id],
    queryFn: () => documentService.verifications(id!),
    enabled: !!id,
  });

  const versions = useQuery({
    queryKey: ['document-versions', id],
    queryFn: () => documentService.versions(id!),
    enabled: !!id,
  });

  const downloads = useQuery({
    queryKey: ['document-downloads', id],
    queryFn: () => accessService.downloads(id!),
    enabled: !!id,
  });

  const config = useQuery({
    queryKey: ['blockchain', 'config'],
    queryFn: blockchainService.config,
    staleTime: Infinity,
  });

  // Enrich the certificate with the on-chain owner wallet + timestamp.
  const chainForCert = useQuery({
    queryKey: ['chain-record', document.data?.sha256Hash],
    queryFn: () => blockchainService.getByHash(document.data!.sha256Hash),
    enabled: certOpen && document.data?.blockchainStatus === 'CONFIRMED' && !!document.data?.sha256Hash,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { transactionHash, blockNumber } = await registerHashOnChain(wallet, {
        hash: document.data!.sha256Hash,
        originalName: document.data!.originalName,
      });
      return documentService.register(id!, { transactionHash, blockNumber });
    },
    onSuccess: async () => {
      toast('Document registered on the blockchain.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['document', id] });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => {
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
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentService.remove(id!),
    onSuccess: async () => {
      toast('Document deleted. The blockchain record remains permanent.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate('/documents');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Delete failed'),
  });

  const download = useMutation({
    mutationFn: () =>
      documentService.download(id!, document.data?.originalName ?? 'document'),
    onSuccess: () => {
      toast('Download started.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['document-downloads', id] });
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Download failed'),
  });

  if (document.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (document.isError || !document.data) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <p className="font-semibold text-dark">Unable to load this document</p>
        <p className="mt-1 text-sm text-slate-500">{getApiErrorMessage(document.error)}</p>
        <Link to="/documents">
          <Button variant="outline" className="mt-4">Back to Documents</Button>
        </Link>
      </Card>
    );
  }

  const doc = document.data;
  const currentVersionDoc = versions.data?.versions.find((v) => v.isCurrent)?.document;
  const isCurrentVersion = currentVersionDoc?._id === doc._id;
  const txExplorerUrl = doc.transactionHash
    ? blockchainService.explorerTxUrl(config.data?.explorerUrl, doc.transactionHash)
    : null;

  const chain = chainForCert.data;
  const certData: CertificateData = {
    documentName: doc.originalName,
    sha256Hash: doc.sha256Hash,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    ownerWallet: chain?.owner || undefined,
    blockNumber: chain?.blockNumber ?? doc.blockNumber,
    transactionHash: chain?.transactionHash ?? doc.transactionHash,
    registeredAt: chain?.timestamp
      ? new Date(chain.timestamp * 1000).toISOString()
      : doc.uploadedAt,
    contractAddress: doc.contractAddress || config.data?.contractAddress,
    chainName: config.data ? blockchainService.networkName(config.data.chainId) : undefined,
    explorerTxUrl: txExplorerUrl,
    uploadedAt: doc.uploadedAt,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <FileText className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-dark">{doc.originalName}</h2>
              <span className="inline-flex shrink-0 items-center rounded-full bg-secondary-500/10 px-2 py-0.5 text-xs font-bold text-secondary-500">
                v{doc.version ?? 1}
              </span>
            </div>
            <p className="text-xs text-slate-400">Uploaded {formatDateTime(doc.uploadedAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={download.isPending} onClick={() => download.mutate()} icon={<Download className="h-4 w-4" />}>
            Download
          </Button>
          {doc.blockchainStatus === 'PENDING' && (
            <Button size="sm" variant="success" loading={registerMutation.isPending} onClick={() => registerMutation.mutate()} icon={<Zap className="h-4 w-4" />}>
              Register on Blockchain
            </Button>
          )}
          {doc.blockchainStatus === 'CONFIRMED' && isCurrentVersion && (
            <Link to={`/upload?parent=${doc._id}`}>
              <Button size="sm" variant="outline" icon={<GitBranch className="h-4 w-4" />}>
                New Version
              </Button>
            </Link>
          )}
          <Link to={`/verify?document=${doc._id}`}>
            <Button size="sm" icon={<ShieldCheck className="h-4 w-4" />}>Verify</Button>
          </Link>
          {doc.blockchainStatus === 'CONFIRMED' && (
            <Button size="sm" variant="outline" onClick={() => setCertOpen(true)} icon={<ScrollText className="h-4 w-4" />}>
              Certificate
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
            Delete
          </Button>
        </div>
      </div>

      {!isCurrentVersion && currentVersionDoc && (
        <Card className="flex items-start gap-3 border-warning-100 bg-warning-100/40 p-4 sm:items-center">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-dark">This is an older revision</p>
            <p className="text-xs text-slate-600">
              A newer version exists in this document family. Its on-chain
              record is permanent and still verifiable.
            </p>
          </div>
          <Link to={`/documents/${currentVersionDoc._id}`} className="ml-auto shrink-0">
            <Button size="sm" variant="outline">View v{currentVersionDoc.version ?? 1}</Button>
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Share by code */}
        <ShareDownloadCode documentId={doc._id} />

        {/* File info */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold text-dark">Document Information</h3>
          <dl className="space-y-3.5">
            <Row label="File Name" value={doc.originalName} />
            <Row label="Type" value={doc.mimeType} />
            <Row label="Size" value={formatBytes(doc.fileSize)} />
            <Row label="Upload Date" value={formatDate(doc.uploadedAt)} />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Document Fingerprint</dt>
              <dd className="mt-1.5 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed ring-1 ring-slate-100">
                {doc.sha256Hash}
              </dd>
              <p className="mt-1.5 text-xs text-slate-400">
                A unique digital ID of this file. Anyone can use it to prove this document is
                authentic and unchanged.
              </p>
            </div>
          </dl>
        </Card>

        {/* Blockchain info */}
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-dark">
            <Blocks className="h-4 w-4 text-primary-500" /> Blockchain Information
          </h3>
          <dl className="space-y-3.5">
            <Row
              label="Registration Status"
              value={
                <span className="flex items-center gap-2">
                  <StatusBadge status={doc.blockchainStatus} />
                  <VerificationBadge status={doc.verificationStatus} />
                </span>
              }
            />
            <Row label="Blockchain Receipt"
              value={doc.transactionHash ? (
                <span className="flex flex-wrap items-center gap-2">
                  <HashDisplay value={doc.transactionHash} head={10} tail={8} />
                  {txExplorerUrl && (
                    <a href={txExplorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                      View on Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              ) : '—'}
            />
            <Row label="Recorded in Block" value={doc.blockNumber ?? '—'} />
            <Row label="Registration Contract" value={<HashDisplay value={doc.contractAddress ?? ''} head={8} tail={6} copyable={false} />} />
            <Row label="Network ID" value={doc.chainId ?? '—'} />
            <Row
              label="Owner"
              value={
                typeof doc.userId === 'object' && doc.userId !== null
                  ? `${doc.userId.fullName} (${doc.userId.email})`
                  : 'You'
              }
            />
          </dl>
        </Card>

        {/* Version history */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-dark">
            <GitBranch className="h-4 w-4 text-secondary-500" /> Version History
          </h3>
          {versions.isLoading ? (
            <Spinner />
          ) : versions.data && versions.data.versions.length > 1 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Version</th>
                    <th className="table-th">Document</th>
                    <th className="table-th">Fingerprint</th>
                    <th className="table-th">Blockchain</th>
                    <th className="table-th">Uploaded</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {versions.data.versions.map((v) => (
                    <tr key={v.document._id} className="transition-colors hover:bg-slate-50/70">
                      <td className="table-td whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                              v.isCurrent
                                ? 'bg-success-100 text-success-600'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            v{v.version}
                          </span>
                          {v.isCurrent && (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          )}
                        </span>
                      </td>
                      <td className="table-td max-w-[200px]">
                        <Link
                          to={`/documents/${v.document._id}`}
                          className="truncate font-medium text-dark hover:text-primary-600"
                        >
                          {v.document.originalName}
                        </Link>
                      </td>
                      <td className="table-td">
                        <HashDisplay value={v.document.sha256Hash} head={10} tail={8} />
                      </td>
                      <td className="table-td"><StatusBadge status={v.document.blockchainStatus} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">
                        {formatDate(v.document.uploadedAt)}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/verify?document=${v.document._id}`}>
                            <Button size="sm" variant="outline" icon={<ShieldCheck className="h-4 w-4" />}>
                              Verify
                            </Button>
                          </Link>
                          <Link to={`/documents/${v.document._id}`}>
                            <Button size="sm" variant="ghost">Details</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <GitBranch className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500">
                This is the only version of this document so far.
              </p>
              {doc.blockchainStatus === 'CONFIRMED' && isCurrentVersion && (
                <Link to={`/upload?parent=${doc._id}`} className="mt-1.5 text-sm font-medium text-primary-600 hover:underline">
                  Upload a new version →
                </Link>
              )}
            </div>
          )}
        </Card>

        {/* Verification history */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-dark">
            <HistoryIcon className="h-4 w-4 text-secondary-500" /> Verification History
          </h3>
          {verifications.isLoading ? (
            <Spinner />
          ) : verifications.data && verifications.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Result</th>
                    <th className="table-th">Calculated Hash</th>
                    <th className="table-th">Verified At</th>
                    <th className="table-th">Block</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {verifications.data.map((v) => (
                    <tr key={v._id}>
                      <td className="table-td"><VerificationBadge status={v.result} /></td>
                      <td className="table-td"><HashDisplay value={v.calculatedHash} head={10} tail={8} /></td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(v.verifiedAt)}</td>
                      <td className="table-td">{v.blockNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <Link2 className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500">No verification attempts recorded for this document yet.</p>
              <Link to={`/verify?document=${doc._id}`} className="mt-1.5 text-sm font-medium text-primary-600 hover:underline">
                Verify it now →
              </Link>
            </div>
          )}
        </Card>

        {/* Download audit trail */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-dark">
            <ScrollText className="h-4 w-4 text-primary-500" /> Downloads
          </h3>
          {downloads.isLoading ? (
            <Spinner />
          ) : downloads.data && downloads.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="table-th">Downloader</th>
                    <th className="table-th">Method</th>
                    <th className="table-th">When</th>
                    <th className="table-th">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {downloads.data.map((d) => (
                    <tr key={d._id}>
                      <td className="table-td">
                        {d.requesterId
                          ? `${d.requesterId.fullName} (${d.requesterId.email})`
                          : 'Unknown'}
                      </td>
                      <td className="table-td">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            d.method === 'ACCESS_GRANT' || d.method === 'SHARE_CODE'
                              ? 'bg-success-100 text-success-600'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {d.method === 'ACCESS_GRANT'
                            ? 'Approved request'
                            : d.method === 'SHARE_CODE'
                              ? 'Share code'
                              : d.method === 'OWNER'
                                ? 'Owner'
                                : 'Admin'}
                        </span>
                      </td>
                      <td className="table-td whitespace-nowrap text-slate-500">{formatDateTime(d.downloadedAt)}</td>
                      <td className="table-td font-mono text-xs text-slate-400">{d.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <ScrollText className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500">
                No downloads recorded for this document yet. Every successful download is logged here
                so you can audit who obtained a copy.
              </p>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Delete this document?"
        message={`"${doc.originalName}" will be permanently removed from local storage along with its metadata. Its on-chain registration cannot be removed.`}
        confirmLabel="Delete Document"
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />

      <CertificateModal open={certOpen} onClose={() => setCertOpen(false)} data={certOpen ? certData : null} />
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <dt className="shrink-0 text-sm font-medium text-slate-500">{label}</dt>
    <dd className="min-w-0 break-all text-right text-sm text-dark">{value}</dd>
  </div>
);
