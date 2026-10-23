import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Download, KeyRound, RefreshCcw, ShieldCheck } from 'lucide-react';
import { downloadCodeService } from '@/services/downloadCodeService';
import { useToast } from '@/context/ToastContext';
import { getApiErrorMessage } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export const DownloadByCodePage = () => {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const download = useMutation({
    mutationFn: (value: string) => downloadCodeService.downloadByCode(value),
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
    download.mutate(value);
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
            <li>Enter the code here to download the file. You must be signed in — downloads are attributed to your account.</li>
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
