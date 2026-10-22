import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, KeyRound } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface RecoveryPhraseModalProps {
  open: boolean;
  phrase: string;
  onClose: () => void;
}

export const RecoveryPhraseModal = ({ open, phrase, onClose }: RecoveryPhraseModalProps) => {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (open) {
      setCopied(false);
      setAcknowledged(false);
    }
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob(
      [
        'BlockVault recovery phrase\n',
        '=========================\n\n',
        `${phrase}\n\n`,
        'Keep this phrase offline and private. Anyone with this phrase can\n',
        'unwrap your encryption keys. BlockVault support will never ask for it.\n',
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blockvault-recovery-phrase.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const groups = phrase.split('-');

  return (
    <Modal
      open={open}
      onClose={() => {
        if (acknowledged) onClose();
      }}
      title="Save your recovery phrase"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-warning-50 p-3.5 text-warning-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">This is the only time it is shown.</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              It is the only way to recover your encrypted documents if you forget your password.
              Store it offline — BlockVault cannot recover it for you.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <KeyRound className="h-4 w-4 text-primary-500" /> Recovery phrase
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {groups.map((group, index) => (
              <div
                key={`${group}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
              >
                <span className="w-4 text-right text-[10px] font-medium text-slate-400">
                  {index + 1}
                </span>
                <span className="font-mono text-xs font-semibold tracking-wider text-dark">
                  {group}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[11px] break-all text-slate-400">
            {phrase}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            fullWidth
            icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy phrase'}
          </Button>
          <Button variant="outline" fullWidth icon={<Download className="h-4 w-4" />} onClick={download}>
            Download
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-200"
          />
          <span>
            I have saved my recovery phrase in a safe place. I understand it cannot be shown again.
          </span>
        </label>

        <Button fullWidth disabled={!acknowledged} onClick={onClose}>
          I saved my phrase
        </Button>
      </div>
    </Modal>
  );
};
