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

describe('Access request + download flow', () => {
  let app: Express;
  let admin: TestUser;
  let owner: TestUser;
  let requester: TestUser;

  before(async () => {
    app = await getApp();
    await resetDb();
    // First registered user is promoted to ADMIN; the rest become USERs.
    admin = await createUser(app, 'Root Admin', 'admin@boult.test');
    owner = await createUser(app, 'Doc Owner', 'owner@boult.test');
    requester = await createUser(app, 'Eager Requester', 'requester@boult.test');
  });

  after(async () => {
    await stopDb();
  });

  const auth = (user: TestUser) => `Bearer ${user.token}`;

  describe('authentication', () => {
    it('rejects unauthenticated access without a token', async () => {
      await request(app).get('/api/access/requests').expect(401);
      await request(app).get('/api/access/requests/mine').expect(401);
      await request(app).post('/api/access/requests').send({ documentId: 'x' }).expect(401);
      await request(app).get('/api/notifications').expect(401);
      await request(app).get('/api/notifications/unread-count').expect(401);
      await request(app).get('/api/notifications/stream').expect(401);
    });
  });

  describe('requestAccess validations', () => {
    it('returns 404 for a document that does not exist', async () => {
      await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: '000000000000000000000000' })
        .expect(404);
    });

    it('rejects a request for a document that is not blockchain-confirmed', async () => {
      const doc = await seedDocument(owner.id, { confirmed: false });
      const res = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id })
        .expect(400);
      expect(res.body.message).to.contain('not registered on the blockchain');
    });

    it('owner cannot request their own document', async () => {
      const doc = await seedDocument(owner.id);
      const res = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(owner))
        .send({ documentId: doc.id })
        .expect(400);
      expect(res.body.message).to.contain('already own this document');
    });

    it('admin cannot request access (they download directly)', async () => {
      const doc = await seedDocument(owner.id);
      const res = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(admin))
        .send({ documentId: doc.id })
        .expect(400);
      expect(res.body.message).to.contain('Admins may download');
    });
  });

  describe('happy path: request -> approve -> one-time download', () => {
    let doc: SeededDocument;
    let requestId: string;

    before(async () => {
      doc = await seedDocument(owner.id, { originalName: 'contract.pdf' });
    });

    it('requester sends a request and the owner is notified', async () => {
      const res = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id, reason: 'Need it for legal review' })
        .expect(201);
      expect(res.body.data.request.status).to.equal('PENDING');
      expect(res.body.data.request.reason).to.equal('Need it for legal review');
      requestId = String(res.body.data.request._id);

      const notif = await request(app)
        .get('/api/notifications')
        .set('Authorization', auth(owner));
      const types = notif.body.data.notifications.map((n: { type: string }) => n.type);
      expect(types).to.include('ACCESS_REQUESTED');

      const count = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', auth(owner));
      expect(count.body.data.count).to.be.greaterThan(0);
    });

    it('appears in the owner inbox and the requester outbox', async () => {
      const inbox = await request(app)
        .get('/api/access/requests')
        .set('Authorization', auth(owner));
      expect(inbox.status).to.equal(200);
      const inInbox = inbox.body.data.requests.some(
        (r: { _id: string }) => String(r._id) === requestId
      );
      expect(inInbox).to.equal(true);

      const outbox = await request(app)
        .get('/api/access/requests/mine')
        .set('Authorization', auth(requester));
      const inOutbox = outbox.body.data.requests.some(
        (r: { _id: string }) => String(r._id) === requestId
      );
      expect(inOutbox).to.equal(true);
    });

    it('dedupes a repeat request for the same document', async () => {
      const res = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id })
        .expect(200);
      expect(String(res.body.data.request._id)).to.equal(requestId);
    });

    it('a non-owner cannot approve the request', async () => {
      const res = await request(app)
        .post(`/api/access/requests/${requestId}/approve`)
        .set('Authorization', auth(requester))
        .expect(403);
      expect(res.body.message).to.contain('Only the document owner');
    });

    it('owner approves and the requester gets a one-time link', async () => {
      const res = await request(app)
        .post(`/api/access/requests/${requestId}/approve`)
        .set('Authorization', auth(owner))
        .expect(200);
      const r = res.body.data.request;
      expect(r.status).to.equal('APPROVED');
      expect(r.accessToken).to.match(/^[a-f0-9]{64}$/);
      expect(new Date(r.expiresAt).getTime()).to.be.greaterThan(Date.now());

      const notif = await request(app)
        .get('/api/notifications')
        .set('Authorization', auth(requester));
      const types = notif.body.data.notifications.map((n: { type: string }) => n.type);
      expect(types).to.include('ACCESS_APPROVED');
    });

    it('requester downloads exactly once with the link', async () => {
      const mine = await request(app)
        .get('/api/access/requests/mine')
        .set('Authorization', auth(requester));
      const approved = mine.body.data.requests.find((r: { status: string }) => r.status === 'APPROVED');
      expect(approved).to.exist;
      const token = approved.accessToken as string;

      const res = await request(app)
        .get(`/api/access/requests/${token}/download`)
        .set('Authorization', auth(requester))
        .expect(200);
      expect(Buffer.isBuffer(res.body)).to.equal(true);
      expect((res.body as Buffer).equals(doc.file)).to.equal(true);

      const again = await request(app)
        .get(`/api/access/requests/${token}/download`)
        .set('Authorization', auth(requester))
        .expect(400);
      expect(again.body.message).to.contain('already been used');

      const notif = await request(app)
        .get('/api/notifications')
        .set('Authorization', auth(owner));
      const types = notif.body.data.notifications.map((n: { type: string }) => n.type);
      expect(types).to.include('DOCUMENT_DOWNLOADED');
    });
  });

  describe('deny flow', () => {
    it('owner denies and the requester can ask again', async () => {
      const doc = await seedDocument(owner.id);
      const created = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id })
        .expect(201);
      const requestId = String(created.body.data.request._id);

      const denied = await request(app)
        .post(`/api/access/requests/${requestId}/deny`)
        .set('Authorization', auth(owner))
        .expect(200);
      expect(denied.body.data.request.status).to.equal('DENIED');

      const notif = await request(app)
        .get('/api/notifications')
        .set('Authorization', auth(requester));
      const types = notif.body.data.notifications.map((n: { type: string }) => n.type);
      expect(types).to.include('ACCESS_DENIED');

      const retry = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id })
        .expect(201);
      expect(String(retry.body.data.request._id)).not.to.equal(requestId);
    });
  });

  describe('approve guards', () => {
    it('cannot approve twice', async () => {
      const doc = await seedDocument(owner.id);
      const created = await request(app)
        .post('/api/access/requests')
        .set('Authorization', auth(requester))
        .send({ documentId: doc.id })
        .expect(201);
      const requestId = String(created.body.data.request._id);

      await request(app)
        .post(`/api/access/requests/${requestId}/approve`)
        .set('Authorization', auth(owner))
        .expect(200);

      const res = await request(app)
        .post(`/api/access/requests/${requestId}/approve`)
        .set('Authorization', auth(owner))
        .expect(409);
      expect(res.body.message).to.contain('already been decided');
    });
  });

  describe('direct download gating + audit trail', () => {
    it('blocks non-owners but lets the owner/admin download and records audit', async () => {
      const doc = await seedDocument(owner.id, { originalName: 'audited.pdf' });

      await request(app)
        .get(`/api/verification/download/${doc.id}`)
        .set('Authorization', auth(requester))
        .expect(403);

      await request(app)
        .get(`/api/documents/${doc.id}/download`)
        .set('Authorization', auth(requester))
        .expect(403);

      const ownerDl = await request(app)
        .get(`/api/documents/${doc.id}/download`)
        .set('Authorization', auth(owner))
        .expect(200);
      expect((ownerDl.body as Buffer).equals(doc.file)).to.equal(true);

      await request(app)
        .get(`/api/verification/download/${doc.id}`)
        .set('Authorization', auth(admin))
        .expect(200);

      const audit = await request(app)
        .get(`/api/documents/${doc.id}/downloads`)
        .set('Authorization', auth(owner))
        .expect(200);
      const methods = audit.body.data.downloads.map((d: { method: string }) => d.method);
      expect(methods).to.include.members(['OWNER', 'ADMIN']);

      await request(app)
        .get(`/api/documents/${doc.id}/downloads`)
        .set('Authorization', auth(requester))
        .expect(403);
    });
  });
});