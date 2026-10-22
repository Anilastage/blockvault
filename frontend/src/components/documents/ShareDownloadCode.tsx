import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, RefreshCcw, Share2, KeyRound } from 'lucide-react';
import { downloadCodeService } from '@/services/downloadCodeService';
import { documentService } from '@/services/documentService';
import { useVault } from '@/context/VaultContext';
import {
  bytesToBase64Url,
  randomBytes,
  unwrapWithAesKey,
  wrapWithAesKey,
} from '@/utils/crypto';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { DownloadCodeInfo, DocumentItem } from '@/types';

const countdown = (target: string, nowMs: number): string => {
  const ms = new Date(target).getTime() - nowMs;
  if (ms <= 0) return 'expired';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const ShareDownloadCode = ({ document }: { document: DocumentItem }) => {
  const documentId = document._id;
  const toast = useToast();
  const vault = useVault();
  const [shareKeyRaw, setShareKeyRaw] = useState<Uint8Array | null>(null);
  const [preparingLink, setPreparingLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const codeQuery = useQuery<DownloadCodeInfo>({
    queryKey: ['download-code', documentId],
    queryFn: () => downloadCodeService.get(documentId),
    enabled: !!documentId,
  });

  const prepareSecureLink = useCallback(async (): Promise<Uint8Array | null> => {
    const encryption = document.encryption;
    if (!encryption) {
      setShareKeyRaw(null);
      setLinkError('');
      return null;
    }
    setPreparingLink(true);
    setLinkError('');
    try {
      const vaultKeyRaw = await vault.ensureUnlocked();
      const shareKey = randomBytes(32);
      const dekRaw = await unwrapWithAesKey(
        encryption.wrappedKey,
        encryption.keyIv,
        vaultKeyRaw
      );
      const wrappedShareKey = await wrapWithAesKey(shareKey, vaultKeyRaw);
      const wrappedDek = await wrapWithAesKey(dekRaw, shareKey);
      await documentService.setShareKey(document._id, {
        shareKeyWrapped: wrappedShareKey.data,
        shareKeyWrapIv: wrappedShareKey.iv,
        shareDekWrapped: wrappedDek.data,
        shareDekIv: wrappedDek.iv,
      });
      setShareKeyRaw(shareKey);
      return shareKey;
    } catch (err) {
      setLinkError(
        getApiErrorMessage(err) ||
          'Could not create a secure share link. Unlock your vault and try again.'
      );
      return null;
    } finally {
      setPreparingLink(false);
    }
  }, [document._id, document.encryption, vault]);

  useEffect(() => {
    setShareKeyRaw(null);
    setLinkError('');
    setCopied(null);
  }, [documentId]);

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const regen = useMutation({
    mutationFn: () => downloadCodeService.regenerate(documentId),
    onSuccess: () => {
      setCopied(null);
      void queryClient.invalidateQueries({ queryKey: ['download-code', documentId] });
      toast('A new download code has been generated.', 'success');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Could not generate a new code'),
  });

  const code = codeQuery.data?.code ?? '';
  // Group 4+4 for readability (looks like a short code, easier to type).
  const displayCode = code.length >= 5 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
  const baseLink = `${window.location.origin}/download`;

  const copy = async (value: string, kind: 'code' | 'link') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast(
        kind === 'link'
          ? 'Secure link copied. The decryption key stays in the link fragment and never reaches the server.'
          : 'Code copied. Share it with the recipient.',
        'success'
      );
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast(`Could not copy the ${kind}.`, 'error');
    }
  };

  const handleCopyLink = async () => {
    if (!code) return;
    let key = shareKeyRaw;
    if (document.encryption && !key) {
      key = await prepareSecureLink();
    }
    if (document.encryption && !key) return;
    const link = `${baseLink}#code=${code}${key ? `&k=${bytesToBase64Url(key)}` : ''}`;
    await copy(link, 'link');
  };

  const remaining = codeQuery.data ? countdown(codeQuery.data.expiresAt, now) : null;
  const isExpired = remaining === 'expired';

  // The 20-minute code rotates automatically: self-refresh on expiry so the
  // displayed code is never stale and the "generated automatically" promise holds.
  useEffect(() => {
    if (isExpired && codeQuery.data) {
      regen.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  return (
    <Card className="p-5 lg:col-span-2">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-dark">
        <Share2 className="h-4 w-4 text-primary-500" /> Share this document
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        {document.encryption
          ? 'Create a secure link that lets the recipient download and decrypt this document in their browser. The decryption key is carried in the link fragment and never reaches the server.'
          : 'Use a share code to let someone download this document. Each code lasts 20 minutes and a new one is generated automatically.'}
      </p>

      {codeQuery.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ) : code ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center rounded-xl bg-slate-900 px-6 py-3.5 text-white shadow-sm">
              <KeyRound className="mb-1.5 h-5 w-5 text-primary-400" />
              <span className="font-mono text-3xl font-bold tracking-[0.12em]">{displayCode}</span>
            </div>
            <div className="text-sm">
              <p className="text-slate-500">Code refreshes in</p>
              <p className={`font-mono text-lg font-semibold ${isExpired ? 'text-danger' : 'text-dark'}`}>
                {isExpired ? 'Rotating...' : remaining}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => void handleCopyLink()}
              disabled={isExpired || regen.isPending}
              loading={preparingLink}
              icon={
                copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
              }
            >
              {copied === 'link'
                ? 'Link copied'
                : document.encryption
                  ? 'Copy secure link'
                  : 'Copy link'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(code, 'code')}
              disabled={isExpired || regen.isPending || !!document.encryption}
              icon={copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={regen.isPending}
              onClick={() => regen.mutate()}
              icon={<RefreshCcw className="h-4 w-4" />}
            >
              New code
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Unable to load the share code.</p>
      )}

      {!!document.encryption && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          {linkError ? (
            <>
              <span>{linkError}</span>{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void prepareSecureLink()}
              >
                Retry
              </button>
            </>
          ) : preparingLink ? (
            'Preparing the secure link key. Unlock your vault if prompted.'
          ) : (
            'The code alone cannot decrypt an encrypted document. Share the secure link instead.'
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Recipient downloads here:</span>{' '}
        <span className="font-mono text-primary-600">{baseLink}</span>
        <span className="ml-1">
          {' '}
          - the secure link adds the rotating code and, for encrypted documents, the decryption key
          after the # fragment.
        </span>
        <span className="mt-1 block font-medium text-warning-700">
          The recipient must be signed in to BlockVault to redeem the code.
        </span>
      </div>
    </Card>
  );
};

