import { expect } from 'chai';
import request from 'supertest';
import type { Express } from 'express';
import { getApp, resetDb, stopDb, createUser, seedDocument, type TestUser } from './helpers';

describe('Notification endpoints + verify-notification', () => {
  let app: Express;
  let alice: TestUser;
  let bob: TestUser;

  before(async () => {
    app = await getApp();
    await resetDb();
    alice = await createUser(app, 'Alice Owner', 'alice@boult.test');
    bob = await createUser(app, 'Bob Requester', 'bob@boult.test');
  });

  after(async () => {
    await stopDb();
  });

  const auth = (user: TestUser) => `Bearer ${user.token}`;

  it('starts empty', async () => {
    const res = await request(app).get('/api/notifications').set('Authorization', auth(alice));
    expect(res.status).to.equal(200);
    expect(res.body.data.pagination.total).to.equal(0);
  });

  it('marks notifications as read and supports read-all', async () => {
    const doc = await seedDocument(alice.id);
    await request(app)
      .post('/api/access/requests')
      .set('Authorization', auth(bob))
      .send({ documentId: doc.id })
      .expect(201);

    let res = await request(app).get('/api/notifications').set('Authorization', auth(alice));
    expect(res.body.data.pagination.total).to.equal(1);
    const notification = res.body.data.notifications[0];
    expect(notification.type).to.equal('ACCESS_REQUESTED');
    expect(notification.read).to.equal(false);

    let count = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', auth(alice));
    expect(count.body.data.count).to.equal(1);

    await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set('Authorization', auth(alice))
      .expect(200);

    count = await request(app).get('/api/notifications/unread-count').set('Authorization', auth(alice));
    expect(count.body.data.count).to.equal(0);

    const readAll = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', auth(alice));
    expect(readAll.body.data.marked).to.equal(0);

    res = await request(app)
      .get('/api/notifications')
      .query({ unread: 'true' })
      .set('Authorization', auth(alice));
    expect(res.body.data.pagination.total).to.equal(0);
  });

  it('does not leak another user is notifications when marking read', async () => {
    const doc = await seedDocument(alice.id);
    await request(app)
      .post('/api/access/requests')
      .set('Authorization', auth(bob))
      .send({ documentId: doc.id })
      .expect(201);

    const mine = await request(app).get('/api/notifications').set('Authorization', auth(alice));
    const bobId = mine.body.data.notifications[0]._id as string;

    await request(app)
      .patch(`/api/notifications/${bobId}/read`)
      .set('Authorization', auth(bob))
      .expect(404);
  });

  describe('notifyDocumentVerified', () => {
    it('notifies the owner when a third party verifies, ignoring self-verifications', async () => {
      const doc = await seedDocument(alice.id, { originalName: 'degree.pdf' });

      const { notifyDocumentVerified } = await import('../src/services/notificationService');
      await notifyDocumentVerified({
        ownerId: alice.id,
        documentId: doc.id,
        documentName: 'degree.pdf',
        verifierId: bob.id,
        verifierName: bob.fullName,
        hash: 'x'.repeat(64),
      });

      const res = await request(app).get('/api/notifications').set('Authorization', auth(alice));
      const found = res.body.data.notifications.find(
        (n: { type: string; entityId: string }) => n.type === 'DOCUMENT_VERIFIED' && String(n.entityId) === doc.id
      );
      expect(found).to.exist;
      expect(found.read).to.equal(false);
      expect(found.metadata.hash).to.equal('x'.repeat(64));

      await notifyDocumentVerified({
        ownerId: alice.id,
        documentId: doc.id,
        documentName: 'degree.pdf',
        verifierId: alice.id,
        verifierName: 'Alice',
        hash: 'y'.repeat(64),
      });

      const after = await request(app).get('/api/notifications').set('Authorization', auth(alice));
      const count = after.body.data.notifications.filter(
        (n: { type: string }) => n.type === 'DOCUMENT_VERIFIED'
      ).length;
      expect(count).to.equal(1);
    });
  });
});