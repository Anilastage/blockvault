import { Contract, JsonRpcProvider } from 'ethers';
import { env } from '../config/env';
import { hexToBytes32 } from '../utils/hash';
import { DocumentModel } from '../models/Document';
import type { ChainRecord } from '../types';

/** Minimal ABI used by the backend for server-side reads and tx validation.
 *  Must match the deployed DocumentVerification contract exactly — see
 *  contracts/DocumentVerification.sol.
 */
export const DOCUMENT_ABI = [
  'function registerDocument(bytes32 documentHash)',
  'function getDocument(bytes32 documentHash) view returns (bool exists, address owner, uint256 timestamp, uint256 blockNumber)',
  'function verifyDocument(bytes32 documentHash) view returns (bool)',
  'function totalDocuments() view returns (uint256)',
  'event DocumentRegistered(bytes32 indexed documentHash, address indexed owner, uint256 timestamp)',
];

let provider: JsonRpcProvider | null = null;

export const getProvider = (): JsonRpcProvider => {
  if (!provider) {
    provider = new JsonRpcProvider(env.blockchain.rpcUrl, undefined, {
      staticNetwork: true,
    });
  }
  return provider;
};

export const getReadContract = (): Contract | null => {
  if (!env.blockchain.contractAddress) return null;
  return new Contract(env.blockchain.contractAddress, DOCUMENT_ABI, getProvider());
};

export const requireContract = (): Contract => {
  const contract = getReadContract();
  if (!contract) {
    throw new Error(
      'CONTRACT_ADDRESS is not configured. Deploy the smart contract and set the environment variable.'
    );
  }
  return contract;
};

export interface ChainLookupResult extends ChainRecord {
  transactionHash?: string;
}

export const lookupOnChain = async (sha256Hex: string): Promise<ChainLookupResult> => {
  const contract = requireContract();
  const bytes32 = hexToBytes32(sha256Hex);
  const [exists, owner, timestamp, blockNumber] = await contract.getDocument(bytes32);
  if (!exists) return { exists: false, owner: '', timestamp: 0, blockNumber: 0 };

  let transactionHash: string | undefined;
  try {
    const filter = contract.filters.DocumentRegistered(bytes32);
    const events = await contract.queryFilter(filter, Number(blockNumber), Number(blockNumber));
    transactionHash = events[0]?.transactionHash;
  } catch {
    // Event query is best-effort; record still valid from getDocument.
  }

  return {
    exists: true,
    owner: owner as string,
    timestamp: Number(timestamp),
    blockNumber: Number(blockNumber),
    transactionHash,
  };
};

export interface TxValidationResult {
  valid: boolean;
  reason?: string;
  details?: {
    from?: string;
    blockNumber?: number;
    documentHash?: string;
    owner?: string;
    timestamp?: number;
  };
}

/**
 * Server-side verification that a submitted transaction really registered
 * the claimed hash on the configured contract. Prevents fabricated tx hashes.
 */
export const validateRegistrationTx = async (
  txHash: string,
  expectedSha256Hex: string
): Promise<TxValidationResult> => {
  try {
    const contract = requireContract();
    const provider = getProvider();

    const receipt = await provider.waitForTransaction(txHash, 1, 60_000);
    if (!receipt || receipt.status !== 1) {
      return { valid: false, reason: 'Transaction failed or was reverted on-chain.' };
    }

    const iface = contract.interface;
    const eventLog = receipt.logs.find((log) => {
      try {
        return (
          log.address.toLowerCase() === env.blockchain.contractAddress.toLowerCase() &&
          iface.parseLog({ topics: log.topics as string[], data: log.data })?.name ===
            'DocumentRegistered'
        );
      } catch {
        return false;
      }
    });

    if (!eventLog) {
      return { valid: false, reason: 'Transaction does not contain a DocumentRegistered event.' };
    }

    const parsed = iface.parseLog({
      topics: eventLog.topics as string[],
      data: eventLog.data,
    });

    const registeredHash = (parsed?.args.documentHash as string).slice(2).toLowerCase();
    if (registeredHash !== expectedSha256Hex.toLowerCase()) {
      return {
        valid: false,
        reason: 'The hash registered in this transaction does not match the uploaded document.',
      };
    }

    return {
      valid: true,
      details: {
        from: receipt.from,
        blockNumber: receipt.blockNumber,
        documentHash: registeredHash,
        owner: parsed?.args.owner as string,
        timestamp: Number(parsed?.args.timestamp),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ECONNREFUSED') || message.includes('network')) {
      throw err; // Let global handler turn this into a 503.
    }
    return { valid: false, reason: `Could not verify transaction on-chain: ${message}` };
  }
};

let lastReconcile = 0;

/**
 * Reconciles locally-stored `CONFIRMED` documents against the live chain. A
 * local chain reset or contract redeploy leaves the DB with stale "Confirmed"
 * records whose transaction hashes no longer exist on-chain. This flips those
 * to `FAILED` so the UI stops showing phantom registrations. Throttled so the
 * on-chain reads don't hammer the node on every request.
 *
 * @returns number of documents whose status was corrected to FAILED.
 */
export const reconcileConfirmedDocuments = async (): Promise<number> => {
  const now = Date.now();
  if (now - lastReconcile < 60_000) return 0;
  lastReconcile = now;

  if (!env.blockchain.contractAddress) return 0;

  const docs = await DocumentModel.find({ blockchainStatus: 'CONFIRMED' }).select(
    '_id sha256Hash'
  );

  let changed = 0;
  for (const d of docs) {
    try {
      const { exists } = await lookupOnChain(d.sha256Hash);
      if (!exists) {
        await DocumentModel.updateOne({ _id: d._id }, { blockchainStatus: 'FAILED' });
        changed++;
      }
    } catch {
      // RPC error — leave as-is; reconcile again on a later request.
    }
  }
  return changed;
};
