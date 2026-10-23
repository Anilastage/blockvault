import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, RefreshCcw, Share2, KeyRound } from 'lucide-react';
import { downloadCodeService } from '@/services/downloadCodeService';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { DownloadCodeInfo } from '@/types';

const countdown = (target: string, nowMs: number): string => {
  const ms = new Date(target).getTime() - nowMs;
  if (ms <= 0) return 'expired';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const ShareDownloadCode = ({ documentId }: { documentId: string }) => {
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const codeQuery = useQuery<DownloadCodeInfo>({
    queryKey: ['download-code', documentId],
    queryFn: () => downloadCodeService.get(documentId),
    enabled: !!documentId,
  });

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const regen = useMutation({
    mutationFn: () => downloadCodeService.regenerate(documentId),
    onSuccess: () => {
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: ['download-code', documentId] });
      toast('A new download code has been generated.', 'success');
    },
    onError: (err) => toast(getApiErrorMessage(err), 'error', 'Could not generate a new code'),
  });

  const code = codeQuery.data?.code ?? '';
  // Group 4+4 for readability (looks like a short code, easier to type).
  const displayCode = code.length >= 5 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
  const shareLink = `${window.location.origin}/download`;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast('Code copied. Share it with the recipient.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy the code.', 'error');
    }
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
        Use a share code to let someone download this document. Each code lasts 20 minutes and a new
        one is generated automatically.
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
                {isExpired ? 'Rotating…' : remaining}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={copy}
              disabled={isExpired || regen.isPending}
              icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            >
              {isExpired ? 'Rotating…' : copied ? 'Copied' : 'Copy code'}
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

      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        <span className="font-medium text-slate-600">Recipient downloads here:</span>{' '}
        <span className="font-mono text-primary-600">{shareLink}</span>
        <span className="ml-1">— share only the code above, not your account.</span>
        {!isAuthenticated && (
          <span className="mt-1 block font-medium text-warning-700">
            Note: the recipient must be signed in to BlockVault to redeem the code.
          </span>
        )}
      </div>
    </Card>
  );
};
