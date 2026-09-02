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
import { JsonRpcProvider, Wallet, type Signer } from 'ethers';
import { blockchainService } from '@/services/blockchainService';
import { useToast } from './ToastContext';

/**
 * Private key for the built-in demo wallet. Defaults to Hardhat's well-known
 * account #0 key so the local node (npm run chain) can fund and mine its
 * transactions. Override via VITE_DEMO_WALLET_KEY in frontend/.env to use a
 * different dev account. Never put a real account key here.
 */
const DEMO_WALLET_KEY =
  import.meta.env.VITE_DEMO_WALLET_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

interface WalletContextValue {
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

/** Remembers the user's demo-wallet choice across page refreshes. */
const PREF_KEY = 'blockvault_demo_wallet_connected';

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const toast = useToast();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [expectedChainId, setExpectedChainId] = useState<number | null>(null);
  const [contractAddress, setContractAddress] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const signerRef = useRef<Signer | null>(null);
  const restoreAttempted = useRef(false);

  // Fetch the expected network configuration from the backend.
  useEffect(() => {
    blockchainService
      .config()
      .then((config) => {
        setExpectedChainId(config.chainId);
        setContractAddress(config.contractAddress ?? '');
        setExplorerUrl(config.explorerUrl ?? '');
        setRpcUrl(config.rpcUrl ?? '');
      })
      .catch(() => undefined);
  }, []);

  const connect = useCallback(async () => {
    if (!rpcUrl) {
      toast(
        'The demo wallet needs a local RPC node. Start it with "npm run chain" and make sure backend/.env points BLOCKCHAIN_RPC_URL at it.',
        'warning'
      );
      return;
    }
    setConnecting(true);
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(DEMO_WALLET_KEY, provider);
      const [address, network] = await Promise.all([wallet.getAddress(), provider.getNetwork()]);
      signerRef.current = wallet;
      setAccount(address);
      setChainId(Number(network.chainId));
      localStorage.setItem(PREF_KEY, '1');
      toast(`Demo wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`, 'success');
    } catch {
      toast('Could not connect the demo wallet. Is the blockchain node running?', 'error');
    } finally {
      setConnecting(false);
    }
  }, [rpcUrl, toast]);

  // Silently restore the demo wallet on reload if the user had connected before.
  // Attempt only once: if the node is down the connect fails and we must NOT retry
  // in a tight loop (would otherwise toast-spam and hammer the RPC).
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
    localStorage.removeItem(PREF_KEY);
    toast('Wallet disconnected.', 'info');
  }, [toast]);

  const switchToExpectedNetwork = useCallback(async () => {
    if (!chainId || !expectedChainId || chainId === expectedChainId) return;
    // The demo wallet connects via JsonRpcProvider to the configured RPC.
    // There is no provider-level network switch here, but we reconnect the
    // signer against the backend's configured network so the app operates on
    // the expected chain.
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(DEMO_WALLET_KEY, provider);
      const network = await provider.getNetwork();
      signerRef.current = wallet;
      setAccount(await wallet.getAddress());
      setChainId(Number(network.chainId));
      toast('Wallet reconnected to the expected network.', 'success');
    } catch {
      toast('Could not reconnect the wallet. Is the blockchain node running?', 'error');
    }
  }, [chainId, expectedChainId, rpcUrl, toast]);

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
      isDemoWallet: !!rpcUrl,
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
      connect,
      disconnect,
      switchToExpectedNetwork,
      getSigner,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextValue => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
};