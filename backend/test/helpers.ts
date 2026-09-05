import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export interface TestUser {
  token: string;
  id: string;
  email: string;
  fullName: string;
}

let mongo: MongoMemoryServer | null = null;
let app: Express | null = null;
const createdFiles: string[] = [];

/** Start the in-memory MongoDB (once) and env required before app import. */
export const startDb = async (): Promise<string> => {
  if (mongo) return mongo.getUri();
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.NODE_ENV = 'test';
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongo.getUri());
  return mongo.getUri();
};

/** Drop every collection so suites start from a clean slate. */
export const resetDb = async (): Promise<void> => {
  await mongoose.connection.dropDatabase();
  await cleanupFiles();
};

/** Stop the DB and delete tracked test files. */
export const stopDb = async (): Promise<void> => {
  await cleanupFiles();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
  mongo = null;
  app = null;
};

/** Lazy singleton Express app. Imports src AFTER env is staged. */
export const getApp = async (): Promise<Express> => {
  if (app) return app;
  await startDb();
  const mod = (await import('../src/app')) as { createApp: () => Express };
  app = mod.createApp();
  return app;
};

/** Register a fresh user through the real auth endpoint, then complete the
 * mandatory email verification so the returned token is a valid session. */
export const createUser = async (
  targetApp: Express,
  fullName: string,
  email: string,
  password = 'Password123!'
): Promise<TestUser> => {
  const res = await request(targetApp)
    .post('/api/auth/register')
    .send({ fullName, email, password, confirmPassword: password })
    .expect(201);

  const { id, requiresEmailVerification, mfaToken, devCode } = res.body.data as {
    id?: string;
    user?: { id?: string };
    requiresEmailVerification?: boolean;
    mfaToken?: string;
    devCode?: string;
  };

  if (!requiresEmailVerification || !mfaToken || !devCode) {
    throw new Error('createUser: register did not return an email verification challenge');
  }

  const verified = await request(targetApp)
    .post('/api/auth/verify-email')
    .send({ mfaToken, code: devCode })
    .expect(200);

  return {
    token: verified.body.data.token as string,
    id: (id ?? (res.body.data.user?.id as string)) as string,
    email,
    fullName,
  };
};

const sha256Of = (buffer: Buffer): string => crypto.createHash('sha256').update(buffer).digest('hex');

export interface SeededDocument {
  id: string;
  originalName: string;
  file: Buffer;
}

/**
 * Write a real file to the uploads directory and create a CONFIDENTLY-seeded
 * Document record owned by `userId`. `confirmed=false` seeds a PENDING
 * document (rejected by the access flow).
 */
export const seedDocument = async (
  userId: string,
  opts: { originalName?: string; confirmed?: boolean } = {}
): Promise<SeededDocument> => {
  const originalName = opts.originalName ?? `test-doc-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const file = Buffer.from(`BlockVault test content: ${originalName} :: ${Date.now()}`.repeat(8));

  const fileName = `${Date.now()}-${crypto.randomUUID()}`;
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), file);
  createdFiles.push(fileName);

  const { DocumentModel } = await import('../src/models/Document');
  const document = await DocumentModel.create({
    userId,
    originalName,
    fileName,
    fileSize: file.length,
    mimeType: 'application/pdf',
    storagePath: fileName,
    sha256Hash: sha256Of(file),
    blockchainHash: sha256Of(file),
    transactionHash: `0x${'a'.repeat(64)}`,
    blockNumber: 123_456,
    contractAddress: '0x'.padEnd(42, 'b'),
    chainId: 31337,
    uploadedAt: new Date(),
    blockchainStatus: opts.confirmed === false ? 'PENDING' : 'CONFIRMED',
    verificationStatus: opts.confirmed === false ? 'UNVERIFIED' : 'VERIFIED',
  });
  return { id: String(document._id), originalName, file };
};

/** Remove any files created by seedDocument. */
export const cleanupFiles = async (): Promise<void> => {
  for (const name of createdFiles.splice(0)) {
    await fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => undefined);
  }
};