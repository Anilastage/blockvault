import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { shortenHash } from '@/utils/format';

interface HashDisplayProps {
  value?: string | null;
  head?: number;
  tail?: number;
  copyable?: boolean;
  mono?: boolean;
  className?: string;
}

export const HashDisplay = ({
  value,
  head = 10,
  tail = 8,
  copyable = true,
  mono = true,
  className = '',
}: HashDisplayProps) => {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-slate-400">—</span>;

  const full = value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. non-secure context) — ignore silently.
    }
  };

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 ${className}`}>
      <span
        className={`${mono ? 'font-mono' : ''} text-xs text-slate-700 truncate`}
        title={full}
      >
        {shortenHash(value, head, tail)}
      </span>
      {copyable && (
        <button
          onClick={copy}
          className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-primary-500"
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          title="Copy"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
};
