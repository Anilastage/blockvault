import crypto from 'crypto';
import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import { Wallet } from 'ethers';
import { getApp, createUser, resetDb, seedDocument, stopDb, type TestUser } from './helpers';

const VALID_TX = `0x${'c'.repeat(64)}`;

const walletA = new Wallet(crypto.createHash('sha256').update('wallet-a').digest('hex'));
const walletB = new Wallet(crypto.createHash('sha256').update('wallet-b').digest('hex'));

interface RegistrationTxValidator {
  validate: (
    txHash: string,
    expectedSha256Hex: string
  ) => Promise<{
    valid: boolean;
    reason?: string;
    details?: { from?: string; blockNumber?: number };
  }>;
}

interface BlockchainServiceModule {
  registrationTxValidator: RegistrationTxValidator;
}

let app: Express;
let user: TestUser;
let blockchain: BlockchainServiceModule;
const realValidate = async () => ({ valid: false });

const linkMessage = async (
  token: string,
  address: string
): Promise<string> => {
  const res = await request(app)
    .get('/api/users/wallet/link-message')
    .query({ address })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data.message as string;
};

interface LinkPayload {
  address: string;
  message: string;
  signature: string;
}

/** Requests a message and signs it with `wallet`, producing a valid payload. */
const signLink = async (
  token: string,
  wallet: Wallet,
  addressOverride?: string
): Promise<LinkPayload> => {
  const address = addressOverride ?? wallet.address;
  const message = await linkMessage(token, address);
  return { address, message, signature: await wallet.signMessage(message) };
};

const postLink = (token: string, payload: LinkPayload): request.Test =>
  request(app)
    .post('/api/users/wallet/link')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

/** Happy path: sign the message with `wallet` and expect the link to succeed. */
const link = async (
  token: string,
  wallet: Wallet,
  addressOverride?: string
): Promise<void> => {
  await postLink(token, await signLink(token, wallet, addressOverride)).expect(200);
};

const walletOf = async (token: string): Promise<string | undefined> => {
  const res = await request(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return res.body.data.user.walletAddress as string | undefined;
};

/** Rebuilds the canonical link message with a chosen issue time. */
const messageAt = (address: string, issuedAt: Date, nonce = 'a'.repeat(32)): string =>
  [
    'BlockVault - Link Wallet',
    '',
    `Wallet: ${address}`,
    `Issued at: ${issuedAt.toISOString()}`,
    `Nonce: ${nonce}`,
    '',
    'Signing proves you control this wallet. No transaction is sent and no gas is spent.',
  ].join('\n');

const stubRegistration = (from: string | undefined): void => {
  blockchain.registrationTxValidator.validate = async () => ({
    valid: true,
    details: { from, blockNumber: 555 },
  });
};

describe('Wallet binding to accounts', () => {
  before(async () => {
    app = await getApp();
    blockchain = (await import(
      '../src/services/blockchainService'
    )) as unknown as BlockchainServiceModule;
    blockchain.registrationTxValidator.validate = realValidate;
  });

  beforeEach(async () => {
    await resetDb();
    blockchain.registrationTxValidator.validate = realValidate;
    user = await createUser(app, 'Wallet Owner', 'wallet-owner@example.com');
  });

  after(async () => {
    await stopDb();
  });

  describe('link message endpoint', () => {
    it('requires authentication', async () => {
      await request(app)
        .get('/api/users/wallet/link-message')
        .query({ address: walletA.address })
        .expect(401);
    });

    it('rejects a malformed address', async () => {
      await request(app)
        .get('/api/users/wallet/link-message')
        .query({ address: 'not-an-address' })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(400);
    });

    it('issues a fresh canonical message for the address', async () => {
      const message = await linkMessage(user.token, walletA.address);
      expect(message).to.contain(walletA.address);
      expect(message).to.contain('BlockVault - Link Wallet');
      const second = await linkMessage(user.token, walletA.address);
      expect(second).to.not.equal(message);
    });
  });

  describe('linking', () => {
    it('stores a wallet that produced a valid signature', async () => {
      await link(user.token, walletA);
      expect(await walletOf(user.token)).to.equal(walletA.address.toLowerCase());
    });

    it('is case insensitive on the submitted address', async () => {
      await link(user.token, walletA, walletA.address.toUpperCase().replace('0X', '0x'));
      expect(await walletOf(user.token)).to.equal(walletA.address.toLowerCase());
    });

    it('rejects a signature made by a different wallet', async () => {
      const res = await postLink(
        user.token,
        await signLink(user.token, walletB, walletA.address)
      ).expect(400);
      expect(JSON.stringify(res.body)).to.contain('not produced by this wallet');
      expect(await walletOf(user.token)).to.equal(undefined);
    });

    it('rejects a message that does not match the requested address', async () => {
      const message = await linkMessage(user.token, walletB.address);
      const signature = await walletA.signMessage(message);
      await postLink(user.token, { address: walletA.address, message, signature }).expect(400);
    });

    it('rejects an altered message', async () => {
      const message = await linkMessage(user.token, walletA.address);
      const signature = await walletA.signMessage(message);
      await request(app)
        .post('/api/users/wallet/link')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ address: walletA.address, message: `${message}\nExtra line`, signature })
        .expect(400);
    });

    it('rejects a message that is older than the 15 minute window', async () => {
      const stale = messageAt(walletA.address, new Date(Date.now() - 16 * 60 * 1000));
      const signature = await walletA.signMessage(stale);
      const res = await request(app)
        .post('/api/users/wallet/link')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ address: walletA.address, message: stale, signature })
        .expect(400);
      expect(JSON.stringify(res.body)).to.contain('expired');
    });

    it('rejects a message dated far in the future', async () => {
      const future = messageAt(walletA.address, new Date(Date.now() + 60 * 60 * 1000));
      const signature = await walletA.signMessage(future);
      await request(app)
        .post('/api/users/wallet/link')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ address: walletA.address, message: future, signature })
        .expect(400);
    });

    it('rejects a message signed with an unrelated nonce replay', async () => {
      const message = messageAt(walletA.address, new Date());
      const signature = await walletA.signMessage(message);
      const replayed = messageAt(walletA.address, new Date(), 'b'.repeat(32));
      const res = await request(app)
        .post('/api/users/wallet/link')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ address: walletA.address, message: replayed, signature })
        .expect(400);
      expect(JSON.stringify(res.body)).to.contain('altered');
    });

    it('rejects a malformed signature', async () => {
      const message = await linkMessage(user.token, walletA.address);
      await request(app)
        .post('/api/users/wallet/link')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ address: walletA.address, message, signature: '0xdeadbeef' })
        .expect(400);
    });

    it('requires authentication', async () => {
      const message = await linkMessage(user.token, walletA.address);
      const signature = await walletA.signMessage(message);
      await request(app)
        .post('/api/users/wallet/link')
        .send({ address: walletA.address, message, signature })
        .expect(401);
    });

    it('lets a verified wallet replace a previously linked wallet', async () => {
      await link(user.token, walletA);
      await link(user.token, walletB);
      expect(await walletOf(user.token)).to.equal(walletB.address.toLowerCase());
    });
  });

  describe('profile updates cannot set a wallet', () => {
    it('rejects a walletAddress in the profile payload', async () => {
      await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fullName: 'Still Owner', walletAddress: walletB.address })
        .expect(400);
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(res.body.data.user.walletAddress).to.equal(undefined);
    });

    it('still updates the name without touching the wallet', async () => {
      await link(user.token, walletA);
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ fullName: 'Renamed Owner' })
        .expect(200);
      expect(res.body.data.user.fullName).to.equal('Renamed Owner');
      expect(res.body.data.user.walletAddress).to.equal(walletA.address.toLowerCase());
    });
  });

  describe('unlinking', () => {
    it('requires the correct password', async () => {
      await link(user.token, walletA);
      await request(app)
        .post('/api/users/wallet/unlink')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: 'WrongPassword1!' })
        .expect(401);
      expect(await walletOf(user.token)).to.equal(walletA.address.toLowerCase());
    });

    it('clears the linked wallet with the right password', async () => {
      await link(user.token, walletA);
      await request(app)
        .post('/api/users/wallet/unlink')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: 'Password123!' })
        .expect(200);
      expect(await walletOf(user.token)).to.equal(undefined);
    });

    it('requires authentication', async () => {
      await request(app)
        .post('/api/users/wallet/unlink')
        .send({ password: 'Password123!' })
        .expect(401);
    });
  });

  describe('registration requires the linked wallet as signer', () => {
    const upload = (token: string, file: Buffer, name: string) => {
      const sha256Hash = crypto.createHash('sha256').update(file).digest('hex');
      const uploadName = name.replace(/\.[^.]+$/, '.pdf');
      return request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .field('originalName', uploadName)
        .field('fileName', uploadName)
        .field('fileSize', String(file.length))
        .field('mimeType', 'application/pdf')
        .field('sha256Hash', sha256Hash)
        .field('transactionHash', VALID_TX)
        .attach('file', file, uploadName);
    };

    it('refuses registration when no wallet is linked', async () => {
      stubRegistration(walletA.address);
      const file = Buffer.from('unlinked wallet attempt');
      const res = await upload(user.token, file, 'unlinked.txt').expect(400);
      expect(JSON.stringify(res.body)).to.contain('Link your wallet');
    });

    it('refuses a transaction sent by a wallet that is not the linked one', async () => {
      await link(user.token, walletA);
      stubRegistration(walletB.address);
      const file = Buffer.from('registered by the wrong wallet');
      const res = await upload(user.token, file, 'wrong-wallet.txt').expect(400);
      expect(JSON.stringify(res.body)).to.contain('not the wallet linked to your account');
    });

    it('accepts a transaction sent by the linked wallet', async () => {
      await link(user.token, walletA);
      stubRegistration(walletA.address.toLowerCase());
      const file = Buffer.from('registered by the linked wallet');
      await upload(user.token, file, 'linked-wallet.txt').expect(201);
    });

    it('applies the same rule to deferred registration', async () => {
      const doc = await seedDocument(user.id, { confirmed: false });
      stubRegistration(walletA.address);
      await request(app)
        .post(`/api/documents/${doc.id}/register`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ transactionHash: VALID_TX })
        .expect(400);

      await link(user.token, walletA);
      stubRegistration(walletB.address);
      await request(app)
        .post(`/api/documents/${doc.id}/register`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ transactionHash: VALID_TX })
        .expect(400);

      stubRegistration(walletA.address.toLowerCase());
      const res = await request(app)
        .post(`/api/documents/${doc.id}/register`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ transactionHash: VALID_TX })
        .expect(200);
      expect(res.body.data.document.blockchainStatus).to.equal('CONFIRMED');
    });
  });
});
