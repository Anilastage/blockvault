import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BrowserProvider,
  JsonRpcProvider,
  Wallet,
  type Eip1193Provider,
  type Signer,
} from 'ethers';
import { blockchainService } from '@/services/blockchainService';
import { useToast } from './ToastContext';
import { WalletSetupModal } from '@/components/wallet/WalletSetupModal';

/**
 * Private key for the built-in demo wallet. This is ONLY used as a last-resort
 * fallback during local development when no browser wallet (MetaMask) is
 * installed — it is deliberately disabled on the deployed site, where users
 * must connect a real wallet. It defaults to Hardhat's well-known account #0
 * key so the local node (npm run chain) can fund and mine its transactions.
 * Override via VITE_DEMO_WALLET_KEY in frontend/.env. Never put a real key here.
 */
const DEMO_WALLET_KEY =
  import.meta.env.VITE_DEMO_WALLET_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/**
 * The demo wallet is only available in the Vite dev server, or when explicitly
 * enabled at build time via VITE_DEMO_WALLET_ENABLED=true.
 */
const demoWalletEnabled = import.meta.env.DEV || import.meta.env.VITE_DEMO_WALLET_ENABLED === 'true';

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      request: (req: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export interface WalletContextValue {
  account: string | null;
  shortAccount: string;
  chainId: number | null;
  expectedChainId: number | null;
  contractAddress: string;
  explorerUrl: string;
  isCorrectNetwork: boolean;
  isConnected: boolean;
  connecting: boolean;
  isDemoWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToExpectedNetwork: () => Promise<void>;
  getSigner: () => Promise<Signer>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** Remembers the wallet choice across page refreshes. */
const PREF_KEY = 'blockvault_wallet_connected';

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const toast = useToast();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [expectedChainId, setExpectedChainId] = useState<number | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [isDemoWallet, setIsDemoWallet] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const signerRef = useRef<Signer | null>(null);
  const restoreAttempted = useRef(false);

  const hasMetaMask = useCallback(() => typeof window !== 'undefined' && !!window.ethereum, []);

  const refreshConfig = useCallback(async (): Promise<void> => {
    try {
      const config = await blockchainService.config();
      setExpectedChainId(config.chainId);
      setContractAddress(config.contractAddress ?? '');
      setExplorerUrl(config.explorerUrl ?? '');
      setRpcUrl(config.rpcUrl ?? '');
    } catch {
      return;
    }
  }, []);

  // Fetch the expected network configuration from the backend.
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const connectDemo = useCallback(async (): Promise<boolean> => {
    if (!rpcUrl) return false;
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(DEMO_WALLET_KEY, provider);
      const [address, network] = await Promise.all([wallet.getAddress(), provider.getNetwork()]);
      signerRef.current = wallet;
      setAccount(address);
      setChainId(Number(network.chainId));
      setIsDemoWallet(true);
      return true;
    } catch {
      return false;
    }
  }, [rpcUrl]);

  const connectMetaMask = useCallback(async (): Promise<boolean> => {
    if (!hasMetaMask()) return false;
    try {
      const provider = new BrowserProvider(window.ethereum as Eip1193Provider);
      await Promise.race([
        provider.send('eth_requestAccounts', []),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Timed out waiting for MetaMask approval')),
            45000
          )
        ),
      ]);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      signerRef.current = signer;
      setAccount(address);
      setChainId(Number(network.chainId));
      setIsDemoWallet(false);
      return true;
    } catch {
      return false;
    }
  }, [hasMetaMask]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      void refreshConfig();
      if (hasMetaMask()) {
        const ok = await connectMetaMask();
        if (ok) {
          localStorage.setItem(PREF_KEY, '1');
          toast('Wallet connected via MetaMask.', 'success');
          return;
        }
        // MetaMask is installed but the connection didn't complete (the popup
        // was dismissed or the user rejected it). Explain instead of guessing.
        toast('MetaMask did not connect. Please approve the connection in the MetaMask popup.', 'warning');
        return;
      }

      // No browser wallet (MetaMask) detected. In development we still allow the
      // built-in demo wallet; on the deployed site we guide the user to install
      // a real wallet instead of silently falling back.
      if (demoWalletEnabled) {
        const ok = await connectDemo();
        if (ok) {
          localStorage.setItem(PREF_KEY, '1');
          toast('Demo wallet connected.', 'success');
          return;
        }
        toast(
          'No MetaMask detected and the demo wallet needs a reachable RPC node. Connect MetaMask in your browser, or start the configured chain.',
          'warning'
        );
        return;
      }

      setShowSetupModal(true);
    } catch {
      toast('Could not connect the wallet.', 'error');
    } finally {
      setConnecting(false);
    }
  }, [hasMetaMask, connectMetaMask, connectDemo, toast, refreshConfig]);

  // Silently restore the wallet on reload if the user had connected before.
  // Attempt only once: if the node is down the connect fails and we must NOT
  // retry in a tight loop (would otherwise toast-spam and hammer the RPC).
  useEffect(() => {
    if (restoreAttempted.current) return;
    if (rpcUrl && !account && !connecting && localStorage.getItem(PREF_KEY) === '1') {
      restoreAttempted.current = true;
      connect();
    }
  }, [rpcUrl, account, connecting, connect]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    signerRef.current = null;
    setIsDemoWallet(false);
    localStorage.removeItem(PREF_KEY);
    toast('Wallet disconnected.', 'info');
  }, [toast]);

  const switchToExpectedNetwork = useCallback(async () => {
    if (!chainId || !expectedChainId || chainId === expectedChainId) return;
    if (hasMetaMask() && window.ethereum) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + expectedChainId.toString(16) }],
        });
        const provider = new BrowserProvider(window.ethereum as Eip1193Provider);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        signerRef.current = signer;
        setAccount(await signer.getAddress());
        setChainId(Number(network.chainId));
        setIsDemoWallet(false);
        toast('Wallet switched to the expected network.', 'success');
        return;
      } catch {
        toast('Could not switch network in MetaMask.', 'error');
        return;
      }
    }
    // Fallback: reconnect the demo wallet against the configured RPC (dev only).
    if (demoWalletEnabled) {
      try {
        const provider = new JsonRpcProvider(rpcUrl);
        const wallet = new Wallet(DEMO_WALLET_KEY, provider);
        const network = await provider.getNetwork();
        signerRef.current = wallet;
        setAccount(await wallet.getAddress());
        setChainId(Number(network.chainId));
        setIsDemoWallet(true);
        toast('Wallet reconnected to the expected network.', 'success');
      } catch {
        toast('Could not reconnect the wallet. Is the blockchain node running?', 'error');
      }
      return;
    }
    toast('Switch to the correct network inside your wallet, then try again.', 'warning');
  }, [chainId, expectedChainId, rpcUrl, hasMetaMask, toast]);

  const getSigner = useCallback(async () => {
    if (!signerRef.current) throw new Error('Wallet is not connected.');
    return signerRef.current;
  }, []);

  const value = useMemo(
    () => ({
      account,
      shortAccount: account ? `${account.slice(0, 6)}...${account.slice(-4)}` : '',
      chainId,
      expectedChainId,
      contractAddress,
      explorerUrl,
      isCorrectNetwork:
        chainId !== null && expectedChainId !== null ? chainId === expectedChainId : true,
      isConnected: !!account,
      connecting,
      isDemoWallet,
      connect,
      disconnect,
      switchToExpectedNetwork,
      getSigner,
    }),
    [
      account,
      chainId,
      expectedChainId,
      contractAddress,
      explorerUrl,
      rpcUrl,
      connecting,
      isDemoWallet,
      connect,
      disconnect,
      switchToExpectedNetwork,
      getSigner,
    ]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletSetupModal
        open={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onRetry={async () => {
          setShowSetupModal(false);
          await connect();
        }}
      />
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextValue => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
};
