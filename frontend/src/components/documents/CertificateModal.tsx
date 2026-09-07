import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Copy, Check, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { formatDateTime, formatBytes } from '@/utils/format';

export interface CertificateData {
  documentName: string;
  sha256Hash: string;
  mimeType?: string;
  fileSize?: number;
  ownerWallet?: string;
  blockNumber?: number;
  transactionHash?: string;
  registeredAt?: string;
  contractAddress?: string;
  chainName?: string;
  uploadedAt?: string;
  explorerTxUrl?: string | null;
}

/**
 * Printable authenticity certificate for a blockchain-registered document. The
 * QR code encodes a public verification link anyone can open without an
 * account; "Print" exports a hard-copy certificate via the browser print
 * dialog (save as PDF).
 */
export const CertificateModal = ({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: CertificateData | null;
}) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const verifyUrl = `${window.location.origin}/verify/${data.sha256Hash}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      toast('Public verification link copied.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy the link.', 'error');
    }
  };

  const print = () => {
    document.title = `Certificate — ${data.documentName}`;
    window.print();
  };

  return (
    <Modal open={open} onClose={onClose} title="Authenticity Certificate" size="xl">
      <div className="certificate-print">
        <div className="no-print mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
          <p className="text-sm text-slate-600">
            Print a hard copy (Save as PDF) or share the QR code — anyone can scan it to verify this
            document without an account.
          </p>
          <div className="ml-3 flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={copy} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
              {copied ? 'Copied' : 'Copy verify link'}
            </Button>
            <Button size="sm" onClick={print} icon={<Printer className="h-4 w-4" />}>
              Print
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="white" strokeWidth="2.2">
                  <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" strokeLinejoin="round" />
                  <path d="M9 11.5h6M9 14.5h4" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight text-dark">
                  Block<span className="text-primary-500">Vault</span>
                </p>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Blockchain Authenticity Certificate
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-0.5 text-xs font-bold text-success-600">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Verified on-chain
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="mt-5 flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Document
                </p>
                <p className="mt-0.5 break-words font-semibold text-dark">{data.documentName}</p>
                {data.mimeType && (
                  <p className="text-xs text-slate-500">
                    {data.mimeType}
                    {data.fileSize !== undefined ? ` · ${formatBytes(data.fileSize)}` : ''}
                    {data.uploadedAt ? ` · uploaded ${formatDateTime(data.uploadedAt)}` : ''}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Document Fingerprint (SHA-256)
                </p>
                <p className="mt-0.5 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-dark ring-1 ring-slate-100">
                  {data.sha256Hash}
                </p>
              </div>

              {data.ownerWallet && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Registered By (Wallet)
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-dark">{data.ownerWallet}</p>
                </div>
              )}

              <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                {data.registeredAt && (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Registered At
                    </dt>
                    <dd className="mt-0.5 text-sm text-dark">{formatDateTime(data.registeredAt)}</dd>
                  </div>
                )}
                {data.blockNumber !== undefined && (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Recorded in Block
                    </dt>
                    <dd className="mt-0.5 text-sm text-dark">#{data.blockNumber}</dd>
                  </div>
                )}
                {data.transactionHash && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Blockchain Receipt
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-dark">
                      {data.transactionHash}
                      {data.explorerTxUrl && (
                        <a
                          href={data.explorerTxUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-primary-600 hover:underline"
                        >
                          View on Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </dd>
                  </div>
                )}
                {data.contractAddress && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Registration Contract
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-dark">
                      {data.contractAddress}
                      {data.chainName ? ` · ${data.chainName}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <QRCodeSVG value={verifyUrl} size={148} level="M" marginSize={1} />
              </div>
              <p className="max-w-[180px] text-center text-[11px] leading-tight text-slate-400">
                Scan to verify this document on {window.location.host}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <p className="text-xs text-slate-400">
              Issued by BlockVault — content-independent proof of existence. The fingerprint above
              was permanently anchored to the blockchain; any later modification will fail
              verification.
            </p>
            <p className="shrink-0 text-xs text-slate-400">
              Verify: <span className="font-mono text-primary-600">{verifyUrl}</span>
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};