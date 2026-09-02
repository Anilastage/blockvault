import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  UploadCloud,
  FileText,
  Hash,
  ExternalLink,
  Loader2,
  Download,
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { verificationService } from '@/services/verificationService';
import { documentService } from '@/services/documentService';
import { accessService } from '@/services/accessService';
import { blockchainService } from '@/services/blockchainService';
import { sha256File, isValidSha256, ACCEPTED_LABEL, MAX_FILE_SIZE_MB } from '@/utils/hash';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HashDisplay } from '@/components/ui/HashDisplay';
import { formatDateTime, formatBytes } from '@/utils/format';
import type { VerifyOutcome, AccessRequestItem } from '@/types';

type Tab = 'file' | 'existing' | 'hash';

export const VerifyPage = () => {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localHash, setLocalHash] = useState('');
  const [hashing, setHashing] = useState(false);
  const [pastedHash, setPastedHash] = useState('');
  const [selectedDocId, setSelectedDocId] = useState(params.get('document') ?? '');
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  // Documents list for the "select existing" tab AND for prefilling the hash
  // when arriving via a ?document= deep link.
  const docs = useQuery({
    queryKey: ['documents', 'verify-list'],
    queryFn: () => documentService.list({ page: 1, limit: 100 }),
    enabled: isAuthenticated && (tab === 'existing' || !!params.get('document')),
  });

  const config = useQuery({
    queryKey: ['blockchain', 'config'],
    queryFn: blockchainService.config,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (params.get('document')) {
      setTab('hash');
      docs.refetch();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDoc = useMemo(
    () =>
      selectedDocId && params.get('document')
        ? undefined
        : docs.data?.documents.find((d) => d._id === selectedDocId),
    [docs.data, selectedDocId, params]
  );

  const prefillDoc = useMemo(() => {
    if (!docs.data || !params.get('document')) return null;
    return docs.data.documents.find((d) => d._id === params.get('document')) ?? null;
  }, [docs.data, params]);

  const hashToCheck = prefillDoc?.sha256Hash ?? pastedHash.trim();

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (tab === 'file') {
        if (prefillDoc) {
          return verificationService.verifyUploadedFile(selectedFile!, prefillDoc._id);
        }
        return verificationService.verifyUploadedFile(selectedFile!);
      }
      if (!isValidSha256(hashToCheck)) throw new Error('Please provide a valid 64-character digital fingerprint.');
      if (tab === 'existing' || prefillDoc) {
        return verificationService.verifyByHash(hashToCheck, prefillDoc?._id ?? selectedDoc?._id);
      }
      return verificationService.verifyByHash(hashToCheck);
    },
    onSuccess: (data) => {
      setOutcome(data);
      toast(`Verification complete: ${data.result.replace('_', ' ').toLowerCase()}`, data.result === 'VERIFIED' ? 'success' : 'warning');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Verification failed'),
  });

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024 || file.size === 0) {
      toast('Invalid file. Must be non-empty and under 10 MB.', 'error');
      return;
    }
    setSelectedFile(file);
    setOutcome(null);
    setLocalHash('');
    setHashing(true);
    try {
      setLocalHash(await sha256File(file));
    } finally {
      setHashing(false);
    }
  };

  const canSubmit =
    tab === 'file'
      ? !!selectedFile && !hashing
      : tab === 'existing'
        ? !!(prefillDoc || selectedDoc)
        : isValidSha256(pastedHash.trim());

  const explorerTx =
    outcome?.chain.transactionHash && outcome.chain.exists
      ? blockchainService.explorerTxUrl(config.data?.explorerUrl, outcome.chain.transactionHash)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* Tabs */}
      <Card className="p-2">
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { key: 'file', label: 'Upload File', icon: UploadCloud },
              { key: 'existing', label: 'My Documents', icon: FileText },
              { key: 'hash', label: 'Paste Hash', icon: Hash },
            ] as Array<{ key: Tab; label: string; icon: typeof Hash }>
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setOutcome(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                tab === key ? 'bg-primary-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Card>

      {!isAuthenticated && (
        <div className="rounded-xl border border-primary-100 bg-primary-50 px-5 py-3.5 text-sm text-primary-700">
          You can verify documents without an account —{' '}
          <Link to="/login" className="font-semibold underline underline-offset-2">
            sign in
          </Link>{' '}
          to keep a full verification history.
        </div>
      )}

      {/* Inputs */}
      {tab === 'file' && (
        <Card className="overflow-hidden">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center px-6 py-12 text-center transition-colors hover:bg-slate-50"
            role="button"
            tabIndex={0}
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-600">
              <UploadCloud className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-dark">
              {selectedFile ? selectedFile.name : 'Select the document to verify'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {selectedFile
                ? `${formatBytes(selectedFile.size)}`
                : `${ACCEPTED_LABEL} · up to ${MAX_FILE_SIZE_MB} MB`}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>
          {(hashing || localHash) && (
            <div className="border-t border-slate-100 px-5 py-3.5">
              {hashing ? (
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing fingerprint…
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Calculated</span>
                  <HashDisplay value={localHash} head={16} tail={14} />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === 'existing' && (
        <Card className="p-5">
          {docs.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
          ) : docs.data && docs.data.documents.length > 0 ? (
            <>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Choose a document</label>
              <select
                value={params.get('document') ?? selectedDocId}
                onChange={(e) => {
                  if (!params.get('document')) setSelectedDocId(e.target.value);
                  setOutcome(null);
                }}
                disabled={!!params.get('document')}
                className="input-base"
              >
                <option value="">— Select a document —</option>
                {docs.data.documents.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.originalName}
                  </option>
                ))}
              </select>
              {selectedDoc && (
                <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  Registered hash:
                  <HashDisplay value={selectedDoc.sha256Hash} head={10} tail={8} />
                </p>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">
              No documents yet.{' '}
              <Link to="/upload" className="font-medium text-primary-600 hover:underline">
                Upload one first →
              </Link>
            </p>
          )}
        </Card>
      )}

      {tab === 'hash' && (
        <Card className="p-5">
          <Input
            label="Document fingerprint"
            placeholder="a8f2… 64 hexadecimal characters"
            value={params.get('document') && prefillDoc ? prefillDoc.sha256Hash : pastedHash}
            onChange={(e) => {
              if (!params.get('document')) setPastedHash(e.target.value);
              setOutcome(null);
            }}
            mono
            spellCheck={false}
            hint={
              params.get('document') && prefillDoc
                ? `Prefilled from "${prefillDoc.originalName}" — re-upload the current version of this file in the Upload tab to check for modification.`
                : isValidSha256(pastedHash) || pastedHash === ''
                  ? 'Paste the 64-character digital fingerprint to look it up.'
                  : 'Invalid length: a digital fingerprint is exactly 64 characters.'
            }
          />
        </Card>
      )}

      <Button
        size="lg"
        fullWidth
        loading={verifyMutation.isPending}
        disabled={!canSubmit}
        onClick={() => verifyMutation.mutate()}
        icon={<ShieldCheck className="h-5 w-5" />}
      >
        Verify Document
      </Button>

      {/* Result */}
      {outcome && <VerificationResult outcome={outcome} explorerTx={explorerTx} />}
    </div>
  );
};

const VerificationResult = ({
  outcome,
  explorerTx,
}: {
  outcome: VerifyOutcome;
  explorerTx: string | null;
}) => {
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');

  const doc = outcome.document;
  const isOwner = doc?.ownedByMe ?? false;

  const requestQuery = useQuery({
    queryKey: ['access', 'request', doc?.id],
    queryFn: () => accessService.myRequests({ documentId: doc!.id }),
    enabled: !!doc && !isOwner && isAuthenticated,
    refetchInterval: 15_000,
  });

  const request = requestQuery.data?.find(
    (r) => (typeof r.documentId === 'object' ? r.documentId._id === doc?.id : r.documentId === doc?.id)
  );

  const linkExpired =
    request?.status === 'APPROVED' &&
    !!request.expiresAt &&
    new Date(request.expiresAt).getTime() <= Date.now();

  const requestAccess = useMutation({
    mutationFn: () => accessService.request(doc!.id, reason.trim() || undefined),
    onSuccess: async () => {
      toast('Access request sent to the owner. You will be notified when they respond.', 'success');
      setShowReason(false);
      setReason('');
      await requestQuery.refetch();
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Request failed'),
  });

  const downloadOriginal = async () => {
    if (!doc) return;
    setDownloading(true);
    try {
      await verificationService.download(doc.id, doc.originalName);
      toast('Document downloaded.', 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const downloadWithToken = async () => {
    if (!doc || !request?.accessToken) return;
    setDownloading(true);
    try {
      await accessService.downloadWithToken(request.accessToken, doc.originalName);
      toast('Document downloaded.', 'success');
    } catch (err) {
      toast(getApiErrorMessage(err), 'error', 'Download failed');
    } finally {
      setDownloading(false);
      await requestQuery.refetch();
    }
  };

  const configs = {
    VERIFIED: {
      card: 'border-success-100 bg-gradient-to-b from-success-100/60 to-white dark:border-success-500/20 dark:from-success-500/10 dark:to-slate-900',
      icon: <ShieldCheck className="h-9 w-9 text-success" />,
      title: 'Document Authentic',
      titleCls: 'text-success-600 dark:text-success',
      message: 'The calculated hash exactly matches the permanent record stored on the blockchain.',
      chip: 'bg-success-100 text-success-600 dark:bg-success-500/10 dark:text-success',
    },
    MODIFIED: {
      card: 'border-danger-100 bg-gradient-to-b from-danger-100/60 to-white dark:border-danger-500/20 dark:from-danger-500/10 dark:to-slate-900',
      icon: <AlertTriangle className="h-9 w-9 text-danger" />,
      title: 'Document Integrity Failed',
      titleCls: 'text-danger',
      message:
        'The calculated document hash does not match the blockchain record. This file has been modified since it was registered.',
      chip: 'bg-danger-100 text-danger',
    },
    NOT_FOUND: {
      card: 'border-orange-200 bg-gradient-to-b from-orange-50 to-white dark:border-orange-500/20 dark:from-orange-500/10 dark:to-slate-900',
      icon: <HelpCircle className="h-9 w-9 text-orange-500" />,
      title: 'Document Not Registered',
      titleCls: 'text-orange-600 dark:text-orange-400',
      message:
        'No matching blockchain record was found for this hash. The document was never registered with BlockVault.',
      chip: 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
    },
  };
  const cfg = configs[outcome.result];

  return (
    <Card className={`animate-fade-in border-2 p-6 ${cfg.card}`}>
      <div className="flex flex-col items-center text-center">
        <div className="animate-pulse-soft">{cfg.icon}</div>
        <h3 className={`mt-3 text-xl font-bold ${cfg.titleCls}`}>{cfg.title}</h3>
        <p className="mt-2 max-w-md text-sm text-slate-600">{cfg.message}</p>
        <span className={`mt-4 rounded-full px-4 py-1 text-xs font-bold tracking-wider ${cfg.chip}`}>
          {outcome.result.replace('_', ' ')}
        </span>
      </div>

      <div className="mt-6 space-y-4 rounded-xl bg-white/80 p-4 ring-1 ring-slate-100">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Checked Fingerprint</p>
          <p className="mt-1 break-all font-mono text-xs text-dark">{outcome.calculatedHash}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recorded Fingerprint</p>
          <p className="mt-1 break-all font-mono text-xs text-dark">
            {outcome.result === 'NOT_FOUND' ? (
              <span className="text-slate-400">No record found</span>
            ) : (
              outcome.blockchainHash ?? outcome.calculatedHash
            )}
          </p>
        </div>

        {outcome.result !== 'NOT_FOUND' && (
          <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <Detail label="Owner Wallet">
              {outcome.chain.owner ? (
                <HashDisplay value={outcome.chain.owner} head={10} tail={8} />
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Registered At">
              {formatDateTime(outcome.chain.timestamp * 1000)}
            </Detail>
            <Detail label="Recorded in Block">{outcome.chain.blockNumber}</Detail>
            <Detail label="Blockchain Receipt">
              {explorerTx && outcome.chain.transactionHash ? (
                <a href={explorerTx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                  View receipt <ExternalLink className="h-3 w-3" />
                </a>
              ) : outcome.chain.transactionHash ? (
                <HashDisplay value={outcome.chain.transactionHash} head={10} tail={8} copyable={false} />
              ) : (
                '—'
              )}
            </Detail>
          </dl>
        )}

        {doc && (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Original Document
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-dark">
                  {doc.originalName}{' '}
                  <span className="font-normal text-slate-500">
                    · {formatBytes(doc.fileSize)} · by {doc.ownerName}
                  </span>
                </p>
              </div>
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={downloading ? undefined : <Download className="h-4 w-4" />}
                  loading={downloading}
                  onClick={downloadOriginal}
                >
                  Download original
                </Button>
              )}
            </div>
            {!isOwner && (
              <AccessPanel
                authenticated={isAuthenticated}
                request={request}
                linkExpired={linkExpired}
                loading={requestQuery.isLoading}
                showReason={showReason}
                reason={reason}
                deciding={requestAccess.isPending || downloading}
                onReasonChange={(v) => setReason(v)}
                onToggleReason={() => setShowReason((s) => !s)}
                onRequest={() => requestAccess.mutate()}
                onDownload={() => void downloadWithToken()}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

const AccessPanel = ({
  authenticated,
  request,
  linkExpired,
  loading,
  showReason,
  reason,
  deciding,
  onReasonChange,
  onToggleReason,
  onRequest,
  onDownload,
}: {
  authenticated: boolean;
  request?: AccessRequestItem;
  linkExpired: boolean;
  loading: boolean;
  showReason: boolean;
  reason: string;
  deciding: boolean;
  onReasonChange: (value: string) => void;
  onToggleReason: () => void;
  onRequest: () => void;
  onDownload: () => void;
}) => {
  const status = request?.status;

  if (!authenticated)
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-100">
        <span className="text-slate-600">
          This document belongs to someone else. Downloads require owner approval.
        </span>
        <Link to="/login" className="shrink-0 font-semibold text-primary-600 hover:underline">
          Sign in to request access
        </Link>
      </div>
    );

  if (loading)
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-100">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking access status…
      </div>
    );

  if (!request || status === 'DENIED')
    return (
      <div className="space-y-2.5 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-slate-600">
            {status === 'DENIED' && <XCircle className="h-4 w-4 text-danger" />}
            {status === 'DENIED'
              ? 'The owner denied your previous request.'
              : 'This document belongs to someone else. You can download it only with the owner\'s permission.'}
          </span>
          <Button size="sm" variant="outline" onClick={onToggleReason}>
            {showReason ? 'Cancel' : 'Request access'}
          </Button>
        </div>
        {showReason && (
          <div className="flex gap-2">
            <Input
              placeholder="Optional: why do you need a copy?"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              maxLength={500}
            />
            <Button size="sm" loading={deciding} onClick={onRequest} icon={<KeyRound className="h-4 w-4" />}>
              Send
            </Button>
          </div>
        )}
      </div>
    );

  if (status === 'PENDING')
    return (
      <div className="flex items-center gap-2 rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-600 ring-1 ring-warning-100">
        <Loader2 className="h-4 w-4 animate-spin" />
        Awaiting approval from the owner. You'll be notified in real time when they respond.
      </div>
    );

  if (status === 'APPROVED' && request.accessToken && !linkExpired)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success-50 px-4 py-3 ring-1 ring-success-100">
        <span className="flex items-center gap-2 text-sm text-success-600">
          <CheckCircle2 className="h-4 w-4" />
          Access approved. Use your one-time link before{' '}
          <span className="font-semibold">{formatDateTime(request.expiresAt)}</span>.
        </span>
        <Button
          size="sm"
          loading={deciding}
          onClick={onDownload}
          icon={<Download className="h-4 w-4" />}
        >
          Download once
        </Button>
      </div>
    );

  return (
    <div className="space-y-2.5 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-slate-600">
          {status === 'USED' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-success" />
              You already used this one-time link.
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 text-warning-600" />
              Your download link {linkExpired ? 'has expired' : 'is no longer valid'}. Ask the owner
              again for a fresh copy.
            </>
          )}
        </span>
        <Button size="sm" variant="outline" onClick={onToggleReason}>
          {showReason ? 'Cancel' : 'Request again'}
        </Button>
      </div>
      {showReason && (
        <div className="flex gap-2">
          <Input
            placeholder="Optional: why do you need a copy?"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={500}
          />
          <Button size="sm" loading={deciding} onClick={onRequest} icon={<KeyRound className="h-4 w-4" />}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-sm text-dark">{children}</dd>
  </div>
);
