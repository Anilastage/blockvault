import { useState } from 'react';
import { Monitor, RefreshCw, Smartphone, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

type DeviceTab = 'desktop' | 'android' | 'iphone';

interface WalletSetupModalProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void | Promise<void>;
  retrying?: boolean;
}

const INSTALL_URL = 'https://metamask.io/download/';

const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(window.navigator.userAgent);
const isAndroid = typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent);

const getDappDeepLink = (): string => {
  const host = window.location.host;
  if (!host || /^localhost|^127\.|^192\.168\.|^10\./.test(host)) return '';
  return `https://metamask.app.link/dapp/${host}`;
};

const deviceSteps: Record<DeviceTab, { title: string; short: string; steps: string[] }> = {
  desktop: {
    title: 'Desktop',
    short: 'Chrome · Edge · Firefox · Brave',
    steps: [
      'Open metamask.io/download in your browser.',
      'Click "Install MetaMask for your browser" and add the extension.',
      'Click the MetaMask icon (fox) in your browser toolbar to create a wallet.',
      'Return here and click "I installed it — retry".',
    ],
  },
  android: {
    title: 'Android',
    short: 'MetaMask mobile app',
    steps: [
      'Install the MetaMask app from the Google Play Store.',
      'Open the app and create/import a wallet.',
      'Tap "Open BlockVault in the MetaMask app" above — this site reopens inside MetaMask.',
      'Click "Connect Wallet" — MetaMask will ask you to approve the connection.',
    ],
  },
  iphone: {
    title: 'iPhone / iPad',
    short: 'MetaMask mobile app',
    steps: [
      'Install the MetaMask app from the App Store.',
      'Open the app and create/import a wallet.',
      'Tap "Open BlockVault in the MetaMask app" above — this site reopens inside MetaMask.',
      'Click "Connect Wallet" — MetaMask will ask you to approve the connection.',
    ],
  },
};

export const WalletSetupModal = ({ open, onClose, onRetry, retrying }: WalletSetupModalProps) => {
  const [device, setDevice] = useState<DeviceTab>(() =>
    isAndroid ? 'android' : isIOS ? 'iphone' : 'desktop'
  );
  const [copied, setCopied] = useState(false);
  const showDeepLink = isAndroid || isIOS;
  const deepLink = showDeepLink ? getDappDeepLink() : '';
  const info = deviceSteps[device];

  const copyHost = async () => {
    await navigator.clipboard.writeText(window.location.host);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect your wallet" size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          <p className="font-semibold">MetaMask not detected</p>
          <p className="mt-1 text-warning-700">
            BlockVault needs a crypto wallet like MetaMask to sign blockchain transactions (document
            registration). The <span className="font-semibold">MetaMask extension isn&apos;t installed</span> in
            this browser yet.
          </p>
        </div>

        {deepLink && (
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-4">
            <p className="text-sm font-semibold text-primary-800">Have the MetaMask app on this phone?</p>
            <p className="mt-1 text-xs leading-relaxed text-primary-700">
              This opens BlockVault inside the MetaMask app itself — the wallet connects automatically and you
              can sign blockchain transactions right away.
            </p>
            <a href={deepLink} rel="noopener noreferrer" className="mt-3 block">
              <Button fullWidth icon={<ExternalLink className="h-4 w-4" />}>
                Open BlockVault in the MetaMask app
              </Button>
            </a>
            <div className="mt-3 rounded-lg border border-primary-200 bg-white px-3 py-2.5">
              <p className="text-xs font-semibold text-primary-800">App didn&apos;t open?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-primary-700">
                Open the MetaMask app → tap the browser icon → paste this address:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-700">
                  {typeof window !== 'undefined' ? window.location.host : ''}
                </code>
                <button
                  type="button"
                  onClick={copyHost}
                  className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}

        <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
          <Button fullWidth icon={<ExternalLink className="h-4 w-4" />}>
            Install MetaMask
          </Button>
        </a>

        <div>
          <div className="mb-2 flex items-center gap-2">
            {(['desktop', 'android', 'iphone'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDevice(tab)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  device === tab
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {tab === 'desktop' ? (
                  <Monitor className="h-4 w-4" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                {deviceSteps[tab].title}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{info.short}</p>
          <ol className="mt-3 space-y-2">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-600">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-[11px] font-bold text-primary-600">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {!deepLink && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Using another wallet? Any wallet that injects <code className="font-mono">window.ethereum</code>{' '}
            (Rabby, Coinbase Wallet, Brave Wallet, Trust Wallet, ...) also works — just connect it the same
            way.
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <Button onClick={onRetry} loading={retrying} icon={<RefreshCw className="h-4 w-4" />}>
            I installed it — retry
          </Button>
        </div>
      </div>
    </Modal>
  );
};