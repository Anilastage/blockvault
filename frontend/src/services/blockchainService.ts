import { api, unwrap } from './api';
import type {
  BlockchainConfig,
  BlockchainStatusInfo,
  ChainRecord,
  DocumentItem,
  DashboardStats,
  DashboardAnalytics,
  Pagination,
  TxRecord,
} from '@/types';

export const blockchainService = {
  async config(): Promise<BlockchainConfig> {
    const res = await api.get('/blockchain/config');
    return unwrap<BlockchainConfig>(res.data);
  },

  async status(): Promise<BlockchainStatusInfo> {
    const res = await api.get('/blockchain/status');
    return unwrap(res.data);
  },

  async transactions(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortOrder?: 'asc' | 'desc';
    from?: string;
    to?: string;
  } = {}): Promise<{ transactions: TxRecord[]; pagination: Pagination }> {
    const res = await api.get('/blockchain/transactions', { params: query });
    return unwrap(res.data);
  },

  async getByHash(hash: string): Promise<ChainRecord> {
    const res = await api.get(`/blockchain/${hash.replace(/^0x/, '')}`);
    return unwrap<{ record: ChainRecord }>(res.data).record;
  },

  explorerTxUrl(explorerUrl: string | undefined | null, txHash: string): string | null {
    if (!explorerUrl) return null;
    return `${explorerUrl.replace(/\/$/, '')}/tx/${txHash}`;
  },

  /** Derives the network label without hardcoding it in components. */
  networkName(chainId: number | null | undefined): string {
    if (chainId == null) return 'Unknown Network';
    const known: Record<number, string> = {
      1: 'Ethereum Mainnet',
      11155111: 'Sepolia Testnet',
      84532: 'Base Sepolia',
      31337: 'Hardhat Local',
      1337: 'Local Geth',
    };
    return known[chainId] ?? `Custom Network (${chainId})`;
  },
};

export const dashboardService = {
  async stats(): Promise<DashboardStats> {
    const res = await api.get('/dashboard/stats');
    return unwrap(res.data);
  },

  async activity() {
    const res = await api.get('/dashboard/activity');
    return unwrap<{
      recentUploads: DocumentItem[];
      recentVerifications: Array<{ _id: string; result: string; verifiedAt: string; calculatedHash?: string; documentId?: { originalName?: string } | null }>;
      recentActivity: Array<{ _id: string; action: string; createdAt: string; metadata?: Record<string, unknown> }>;
    }>(res.data);
  },

  async analytics(): Promise<DashboardAnalytics> {
    const res = await api.get('/dashboard/analytics');
    return unwrap(res.data);
  },
};
