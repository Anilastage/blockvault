import crypto from 'crypto';
import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import {
  getApp,
  resetDb,
  stopDb,
  createUser,
  seedDocument,
  type TestUser,
  type SeededDocument,
} from './helpers';

describe('Document versioning', () => {
  let app: Express;
  let owner: TestUser;
  let other: TestUser;

  const sha256Of = (buffer: Buffer): string =>
    crypto.createHash('sha256').update(buffer).digest('hex');

  before(async () => {
    app = await getApp();
    await resetDb();
    await createUser(app, 'Root Admin', 'versioning-admin@boult.test');
    owner = await createUser(app, 'Version Owner', 'versions@boult.test');
    other = await createUser(app, 'Other User', 'versions-other@boult.test');
  });

  after(async () => {
    await stopDb();
  });

  const auth = (user: TestUser) => `Bearer ${user.token}`;

  const uploadVersion = (
    user: TestUser,
    parentId: string,
    file: Buffer
  ) =>
    request(app)
      .post('/api/documents')
      .set('Authorization', auth(user))
      .field('originalName', 'contract-v2.pdf')
      .field('fileName', 'contract-v2.pdf')
      .field('fileSize', String(file.length))
      .field('mimeType', 'application/pdf')
      .field('sha256Hash', sha256Of(file))
      .field('parentId', parentId)
      .attach('file', file, { filename: 'contract-v2.pdf' });

  it('returns a single current version for a standalone document', async () => {
    const root = await seedDocument(owner.id);
    const res = await request(app)
      .get(`/api/documents/${root.id}/versions`)
      .set('Authorization', auth(owner))
      .expect(200);
    expect(res.body.data.versions).to.have.length(1);
    expect(res.body.data.versions[0].version).to.equal(1);
    expect(res.body.data.versions[0].isCurrent).to.be.true;
  });

  it('rejects a new version when the parent is not confirmed on-chain', async () => {
    const pending = await seedDocument(owner.id, { confirmed: false });
    const res = await uploadVersion(owner, pending.id, Buffer.from('rev 2 bytes'));
    expect(res.status).to.equal(400);
    expect(res.body.message).to.include('Register the current version');
  });

  it('rejects a new version of a document you do not own', async () => {
    const root = await seedDocument(owner.id);
    const res = await uploadVersion(other, root.id, Buffer.from('rev 2 bytes'));
    expect(res.status).to.equal(403);
  });

  it('rejects a bogus parent id', async () => {
    const res = await uploadVersion(
      owner,
      '000000000000000000000000',
      Buffer.from('rev 2 bytes')
    );
    expect(res.status).to.equal(404);
  });

  it('links a new upload into the family and keeps the full history', async () => {
    const root = await seedDocument(owner.id);
    const file = Buffer.from(`revision payload :: ${Date.now()}`);
    const res = await uploadVersion(owner, root.id, file).expect(201);

    const v2 = res.body.data.document;
    expect(v2.version).to.equal(2);
    expect(String(v2.familyId)).to.equal(root.id);
    expect(String(v2.previousVersionId)).to.equal(root.id);
    expect(v2.previousVersionHash).to.equal(sha256Of(root.file));
    expect(v2.blockchainStatus).to.equal('PENDING');

    const hist = await request(app)
      .get(`/api/documents/${root.id}/versions`)
      .set('Authorization', auth(owner))
      .expect(200);
    expect(hist.body.data.versions).to.have.length(2);
    expect(hist.body.data.currentVersion).to.equal(2);
    const [v1, rev2] = hist.body.data.versions as Array<{
      version: number;
      isCurrent: boolean;
      isSuperseded: boolean;
    }>;
    expect(v1.version).to.equal(1);
    expect(v1.isSuperseded).to.be.true;
    expect(v1.isCurrent).to.be.false;
    expect(rev2.version).to.equal(2);
    expect(rev2.isCurrent).to.be.true;
    expect(rev2.isSuperseded).to.be.false;
  });

  it('serves the history when queried through a child document', async () => {
    const root = await seedDocument(owner.id);
    const v2res = await uploadVersion(owner, root.id, Buffer.from('child query payload'))
      .expect(201);
    const child = v2res.body.data.document;
    const viaChild = await request(app)
      .get(`/api/documents/${child._id}/versions`)
      .set('Authorization', auth(owner))
      .expect(200);
    expect(viaChild.body.data.versions).to.have.length(2);
  });
});