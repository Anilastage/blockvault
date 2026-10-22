import crypto from 'crypto';
import { verifyMessage, getAddress } from 'ethers';
import { ApiError } from '../utils/ApiError';

const LINK_WINDOW_MS = 15 * 60 * 1000;

const buildMessage = (address: string, issuedAt: Date, nonce: string): string =>
  [
    'BlockVault - Link Wallet',
    '',
    `Wallet: ${address}`,
    `Issued at: ${issuedAt.toISOString()}`,
    `Nonce: ${nonce}`,
    '',
    'Signing proves you control this wallet. No transaction is sent and no gas is spent.',
  ].join('\n');

/** Creates the canonical message the user must sign to link a wallet. */
export const createLinkMessage = (address: string): string => {
  const checksummed = getAddress(address);
  return buildMessage(checksummed, new Date(), crypto.randomBytes(16).toString('hex'));
};

const MESSAGE_RE =
  /^BlockVault - Link Wallet\n\nWallet: (0x[a-fA-F0-9]{40})\nIssued at: (.+)\nNonce: ([a-f0-9]{32})\n\nSigning proves you control this wallet\. No transaction is sent and no gas is spent\.$/;

/**
 * Verifies that `signature` over `message` was produced by `address`.
 *
 * The message must be the canonical link message for that exact address, and it
 * must have been issued recently. This is what makes a linked wallet
 * trustworthy: the account holder proved control of the private key, so the
 * on-chain owner of a registration can be tied back to this account.
 */
export const assertValidLinkSignature = (input: {
  address: string;
  message: string;
  signature: string;
}): void => {
  const match = MESSAGE_RE.exec(input.message);
  if (!match) {
    throw ApiError.badRequest('The signing message is not a valid BlockVault link message.');
  }

  const [, walletInMessage, issuedAtRaw, nonce] = match;
  if (walletInMessage.toLowerCase() !== input.address.toLowerCase()) {
    throw ApiError.badRequest('The signing message does not match the wallet being linked.');
  }

  const issuedAt = new Date(issuedAtRaw);
  if (isNaN(issuedAt.getTime())) {
    throw ApiError.badRequest('The signing message has an invalid timestamp.');
  }
  const age = Date.now() - issuedAt.getTime();
  if (age > LINK_WINDOW_MS || age < -60_000) {
    throw ApiError.badRequest(
      'This signing message has expired. Request a new one and sign it again.'
    );
  }

  // Rebuilding from the parsed values guarantees the message had no extra or
  // missing parts, so a signature over a look-alike message cannot be replayed.
  const canonical = buildMessage(walletInMessage, issuedAt, nonce);
  if (canonical !== input.message) {
    throw ApiError.badRequest('The signing message was altered.');
  }

  let recovered: string;
  try {
    recovered = verifyMessage(input.message, input.signature);
  } catch {
    throw ApiError.badRequest('The wallet signature could not be verified.');
  }
  if (recovered.toLowerCase() !== input.address.toLowerCase()) {
    throw ApiError.badRequest(
      'The signature was not produced by this wallet, or the message was altered.'
    );
  }
};
