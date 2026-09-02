import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { env } from '../config/env';
import { lookupOnChain, getReadContract, reconcileConfirmedDocuments } from '../services/blockchainService';
import { ApiError } from '../utils/ApiError';
import { DocumentModel } from '../models/Document';

const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia Testnet',
  11155420: 'OP Sepolia Testnet',
  84532: 'Base Sepolia Testnet',
  31337: 'Hardhat Local Network',
  1337: 'Local Geth Network',
};

export const networkName = (chainId: number): string =>
  NETWORK_NAMES[chainId] ?? `Custom Network (${chainId})`;

export const buildExplorerTxUrl = (txHash: string): string | null => {
  const base = env.blockchain.explorerUrl?.replace(/\/$/, '');
  return base ? `${base}/tx/${txHash}` : null;
};

/** GET /api/blockchain/config — public configuration used by the frontend. */
export const getConfig = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Blockchain configuration',
    data: {
      contractAddress: env.blockchain.contractAddress,
      chainId: env.blockchain.chainId,
      rpcUrl: env.isProd ? undefined : env.blockchain.rpcUrl,
      explorerUrl: env.blockchain.explorerUrl,
    },
  });
});

/**
 * GET /api/blockchain/status
 * Live network/contract status. Reads totalDocuments directly from the
 * contract when the RPC is reachable; reports unhealthy otherwise.
 */
export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  let onChainTotal: number | null = null;
  let rpcHealthy = false;

  if (env.blockchain.contractAddress) {
    try {
      const contract = getReadContract();
      if (contract) {
        onChainTotal = Number(await contract.totalDocuments());
        rpcHealthy = true;
      }
      // Correct stale "Confirmed" DB records that no longer exist on-chain
      // (e.g. after a local chain reset/redeploy). Best-effort.
      await reconcileConfirmedDocuments();
    } catch {
      rpcHealthy = false;
    }
  }

  const verifiedDocuments = await DocumentModel.countDocuments({
    verificationStatus: 'VERIFIED',
  });

  res.json({
    success: true,
    message: 'Blockchain status',
    data: {
      networkName: networkName(env.blockchain.chainId),
      chainId: env.blockchain.chainId,
      contractAddress: env.blockchain.contractAddress,
      explorerUrl: env.blockchain.explorerUrl || null,
      configured: !!env.blockchain.contractAddress,
      rpcHealthy,
      onChainTotalDocuments: onChainTotal,
      verifiedDocuments,
    },
  });
});

/**
 * GET /api/blockchain/transactions
 * Paginated, searchable list of every on-chain document registration. The
 * ledger is public, so any authenticated user can browse all confirmed
 * registrations (wallet, hash, block, timestamp). Actual file contents and
 * per-user document lists remain private via the /documents endpoints.
 */
export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10)));
  const sortDirection = req.query.sortOrder === 'asc' ? 1 : -1;

  const filter: Record<string, unknown> = {
    transactionHash: { $exists: true, $ne: '' },
  };

  const search = req.query.search as string | undefined;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ originalName: rx }, { sha256Hash: rx }, { transactionHash: rx }];
  }

  const status = req.query.status as string | undefined;
  if (status && status !== 'ALL') filter.blockchainStatus = status;

  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const dateFilter: Record<string, Date> = {};
  if (from && !isNaN(from.getTime())) dateFilter.$gte = from;
  if (to && !isNaN(to.getTime())) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }
  if (Object.keys(dateFilter).length) filter.uploadedAt = dateFilter;

  const [docs, total] = await Promise.all([
    DocumentModel.find(filter)
      .sort({ uploadedAt: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'walletAddress'),
    DocumentModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Transactions retrieved',
    data: {
      transactions: docs.map((d) => {
        const owner = d.userId as unknown as { walletAddress?: string } | undefined;
        return {
          _id: d._id,
          documentName: d.originalName,
          sha256Hash: d.sha256Hash,
          transactionHash: d.transactionHash,
          walletAddress: owner?.walletAddress ?? '',
          blockNumber: d.blockNumber,
          blockchainStatus: d.blockchainStatus,
          uploadedAt: d.uploadedAt,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    },
  });
});

export const getByHash = asyncHandler(async (req: Request, res: Response) => {
  const hash = String(req.params.hash).toLowerCase().replace(/^0x/, '');
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw ApiError.badRequest('Invalid hash format. Expected 64 hexadecimal characters.');
  }

  const record = await lookupOnChain(hash);
  if (!record.exists) {
    throw ApiError.notFound('No blockchain record found for this hash');
  }

  res.json({
    success: true,
    message: 'Blockchain record retrieved',
    data: { record },
  });
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const txHash = String(req.params.txHash).toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    throw ApiError.badRequest('Invalid transaction hash format.');
  }

  const document = await DocumentModel.findOne({ transactionHash: txHash }).select(
    'originalName sha256Hash blockNumber uploadedAt userId blockchainStatus'
  );
  if (!document) throw ApiError.notFound('No registered document uses this transaction hash');

  const isOwner = String(document.userId) === String(req.user!.id);
  if (!isOwner && req.user!.role !== 'ADMIN') {
    throw ApiError.forbidden('You do not have access to this transaction');
  }

  res.json({
    success: true,
    message: 'Transaction retrieved',
    data: {
      transaction: {
        transactionHash: txHash,
        blockNumber: document.blockNumber,
        contractAddress: env.blockchain.contractAddress,
        explorerUrl: buildExplorerTxUrl(txHash),
        document: {
          id: document._id,
          originalName: document.originalName,
          sha256Hash: document.sha256Hash,
          blockchainStatus: document.blockchainStatus,
          uploadedAt: document.uploadedAt,
        },
      },
    },
  });
});
