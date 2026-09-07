import { Contract, Interface } from 'ethers';
import type { WalletContextValue } from '@/context/WalletContext';
import { blockchainService } from '@/services/blockchainService';
import { getApiErrorMessage } from '@/services/api';

const ABI = [
  'function registerDocument(bytes32 documentHash)',
  'error AlreadyRegistered(bytes32 documentHash, address existingOwner)',
];
const ABI_IFACE = new Interface(ABI);

export type RegisterStage = 'preparing' | 'signing' | 'pending' | 'confirming';
export type RegistrationErrorKind = 'network' | 'duplicate' | 'contract' | 'general';
export type RegisterFailure =
  | { kind: 'duplicate'; documentHash: string; existingOwner: string }
  | { kind: 'network' }
  | { kind: 'contract'; message: string }
  | { kind: 'general'; message: string };

const decodeAlreadyRegistered = (
  err: unknown
): { documentHash: string; existingOwner: string } | null => {
  const e = err as {
    revert?: { name?: string; args?: unknown[] };
    errorName?: string;
    errorArgs?: unknown[];
    data?: string;
  };
  let args: unknown[] | undefined;
  if (e.revert?.name === 'AlreadyRegistered' && Array.isArray(e.revert.args)) {
    args = e.revert.args;
  } else if (e.errorName === 'AlreadyRegistered' && Array.isArray(e.errorArgs)) {
    args = e.errorArgs;
  }
  if (!args && e.data && e.data.toLowerCase().startsWith('0x01f95aba')) {
    try {
      const parsed = ABI_IFACE.parseError(e.data);
      if (parsed) args = parsed.args;
    } catch {
      // fall through with undefined args
    }
  }
  if (!args || args.length < 2) return null;
  return {
    documentHash: String(args[0]).toLowerCase().replace(/^0x/, ''),
    existingOwner: String(args[1]),
  };
};

/**
 * Signs and submits a registerDocument(bytes32) transaction through the
 * connected wallet, waiting for confirmation. Shared by the upload page, the
 * per-document register action, and the "register all pending" batch flow.
 * @returns the confirmed transaction hash and block number.
 */
export const registerHashOnChain = async (
  wallet: WalletContextValue,
  attempt: { hash: string; originalName: string },
  onStage?: (stage: RegisterStage) => void
): Promise<{ transactionHash: string; blockNumber: number }> => {
  const next = (s: RegisterStage): void => onStage?.(s);

  if (!wallet.isConnected) {
    throw { kind: 'general', message: 'Please connect your wallet first.' } as RegisterFailure;
  }
  if (!wallet.contractAddress) {
    throw {
      kind: 'contract',
      message: 'The smart contract is not deployed yet. Set CONTRACT_ADDRESS on the backend.',
    } as RegisterFailure;
  }
  if (!wallet.isCorrectNetwork) {
    throw { kind: 'network' } as RegisterFailure;
  }

  next('preparing');
  const signer = await wallet.getSigner();
  const deployedCode = await signer.provider?.getCode(wallet.contractAddress);
  if (!deployedCode || deployedCode === '0x') {
    throw {
      kind: 'contract',
      message: `The BlockVault contract is not deployed on ${blockchainService.networkName(wallet.chainId)} (chain ID ${wallet.chainId}).`,
    } as RegisterFailure;
  }

  const contract = new Contract(wallet.contractAddress, ABI, signer);
  next('signing');
  const bytes32 = ('0x' + attempt.hash.toLowerCase()) as `0x${string}`;

  let tx;
  try {
    tx = await contract.registerDocument(bytes32);
  } catch (err) {
    const dup = decodeAlreadyRegistered(err);
    if (dup) throw { kind: 'duplicate', ...dup } as RegisterFailure;
    throw { kind: 'general', message: getApiErrorMessage(err) } as RegisterFailure;
  }

  next('pending');
  const receipt = await tx.wait();
  if (receipt.status !== 1) {
    throw { kind: 'general', message: 'The transaction was reverted by the smart contract.' } as RegisterFailure;
  }
  return { transactionHash: tx.hash, blockNumber: receipt.blockNumber };
};

export const failureMessage = (failure: RegisterFailure): string => {
  if (failure.kind === 'duplicate') return 'This document is already registered on the blockchain.';
  if (failure.kind === 'network') return 'Your wallet is connected to the wrong network.';
  return failure.message;
};

export const isRegisterFailure = (err: unknown): err is RegisterFailure =>
  typeof err === 'object' &&
  err !== null &&
  'kind' in err &&
  ['network', 'duplicate', 'contract', 'general'].includes((err as { kind: string }).kind);