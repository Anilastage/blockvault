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
      'Reinstall this site through MetaMask\'s in-app browser: tap the Ξ menu → Browser → open BlockVault.',
      'Then click "Connect Wallet" — MetaMask will ask you to approve the connection.',
    ],
  },
  iphone: {
    title: 'iPhone / iPad',
    short: 'MetaMask mobile app',
    steps: [
      'Install the MetaMask app from the App Store.',
      'Open the app and create/import a wallet.',
      'Use MetaMask\'s built-in browser (Ξ menu → Browser) to open BlockVault.',
      'Then click "Connect Wallet" — MetaMask will ask you to approve the connection.',
    ],
  },
};

export const WalletSetupModal = ({ open, onClose, onRetry, retrying }: WalletSetupModalProps) => {
  const [device, setDevice] = useState<DeviceTab>('desktop');
  const info = deviceSteps[device];

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

        <a href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
          <Button fullWidth icon={<ExternalLink className="h-4 w-4" />}>
            Go to MetaMask download
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
                {info.title}
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

        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Using another wallet? Any wallet that injects <code className="font-mono">window.ethereum</code>{' '}
          (Rabby, Coinbase Wallet, Brave Wallet, Trust Wallet, ...) also works — just connect it the same
          way.
        </div>

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