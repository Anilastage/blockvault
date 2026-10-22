import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Download, KeyRound, Lock, RefreshCcw, ShieldCheck } from 'lucide-react';
import { downloadCodeService } from '@/services/downloadCodeService';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { base64UrlToBytes } from '@/utils/crypto';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const parseShareFragment = (
  hash: string
): { code: string; shareKey: Uint8Array | null; error: string } => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = (params.get('code') ?? '').replace(/\s+/g, '').toUpperCase();
  const encodedKey = params.get('k');
  if (!encodedKey) return { code, shareKey: null, error: '' };

  try {
    const shareKey = base64UrlToBytes(encodedKey);
    if (shareKey.length !== 32) throw new Error('Invalid key length');
    return { code, shareKey, error: '' };
  } catch {
    return {
      code,
      shareKey: null,
      error: 'This secure link contains an invalid decryption key. Ask the owner for a new link.',
    };
  }
};

export const DownloadByCodePage = () => {
  const toast = useToast();
  const location = useLocation();
  const parsedLink = useMemo(() => parseShareFragment(location.hash), [location.hash]);
  const [code, setCode] = useState(parsedLink.code);
  const [shareKey, setShareKey] = useState<Uint8Array | null>(parsedLink.shareKey);
  const [error, setError] = useState(parsedLink.error);

  useEffect(() => {
    setCode(parsedLink.code);
    setShareKey(parsedLink.shareKey);
    setError(parsedLink.error);
  }, [parsedLink]);

  const download = useMutation({
    mutationFn: ({ value, key }: { value: string; key?: Uint8Array }) =>
      downloadCodeService.downloadByCode(value, key),
    onSuccess: () => {
      setError('');
      toast('Document downloaded successfully.', 'success');
    },
    onError: (err) => {
      const message = getApiErrorMessage(err);
      setError(message);
      toast(message, 'error', 'Download failed');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.replace(/\s+/g, '').toUpperCase();
    if (value.length !== 8) {
      setError('Please enter the 8-character download code.');
      return;
    }
    setError('');
    download.mutate({ value, key: shareKey ?? undefined });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <Card className="p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
            <Download className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-dark">Download a Document</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the share code you received from the document owner to download the file.
          </p>
        </div>

        {shareKey && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3 text-xs text-slate-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>
              Secure link detected. This encrypted document will be decrypted in your browser; the
              decryption key never leaves this page.
            </span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Share code"
            placeholder="e.g. 85EDY5RA"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError('');
            }}
            mono
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            maxLength={12}
            error={error || undefined}
            hint="Codes are 8 characters (spaces are ignored) and rotate every 20 minutes."
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={download.isPending}
            disabled={download.isPending || code.replace(/\s+/g, '').length !== 8}
            icon={<KeyRound className="h-5 w-5" />}
          >
            Retrieve & Download
          </Button>
        </form>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
          <p className="flex items-center gap-1.5 font-semibold text-slate-600">
            <RefreshCcw className="h-3.5 w-3.5 text-primary-500" /> How it works
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              The owner shares a unique <strong>8-character code</strong> for a specific document.
            </li>
            <li>
              Enter the code here to download the file. You must be signed in so the download is
              attributed to your account.
            </li>
            <li>
              Encrypted documents also need the <strong>full secure link</strong>; the code alone
              cannot decrypt them.
            </li>
            <li>Each code stays valid for <strong>20 minutes</strong>, then a new one is generated.</li>
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1 text-sm text-slate-500">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span>
            Prefer to check authenticity first?{' '}
            <Link to="/verify" className="font-medium text-primary-600 hover:underline">
              Verify a document
            </Link>
          </span>
        </div>
      </Card>
    </div>
  );
};
