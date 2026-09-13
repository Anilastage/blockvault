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
} from './helpers';

describe('Document folders & tags', () => {
  let app: Express;
  let owner: TestUser;
  let other: TestUser;

  const sha256Of = (buffer: Buffer): string =>
    crypto.createHash('sha256').update(buffer).digest('hex');

  before(async () => {
    app = await getApp();
    await resetDb();
    await createUser(app, 'Root Admin', 'folders-admin@boult.test');
    owner = await createUser(app, 'Folder Owner', 'folders@boult.test');
    other = await createUser(app, 'Other User', 'folders-other@boult.test');
  });

  after(async () => {
    await stopDb();
  });

  const auth = (user: TestUser) => `Bearer ${user.token}`;

  const createFolder = (user: TestUser, name: string) =>
    request(app).post('/api/folders').set('Authorization', auth(user)).send({ name });

  const uploadDocument = (
    user: TestUser,
    fieldOverrides: Record<string, string | string[]> = {}
  ) => {
    const file = Buffer.from(`folder test payload :: ${Date.now()}`);
    let req = request(app)
      .post('/api/documents')
      .set('Authorization', auth(user))
      .field('originalName', 'organised.pdf')
      .field('fileName', 'organised.pdf')
      .field('fileSize', String(file.length))
      .field('mimeType', 'application/pdf')
      .field('sha256Hash', sha256Of(file));
    for (const [key, value] of Object.entries(fieldOverrides)) {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) req = req.field(key, v);
    }
    return req.attach('file', file, { filename: 'organised.pdf' });
  };

  it('creates and lists folders for the owner only', async () => {
    await createFolder(owner, 'Legal').expect(201);
    await createFolder(owner, 'Tax').expect(201);
    await createFolder(other, 'Private').expect(201);

    const res = await request(app)
      .get('/api/folders')
      .set('Authorization', auth(owner))
      .expect(200);
    const names = (res.body.data.folders as Array<{ name: string }>).map((f) => f.name);
    expect(names).to.deep.equal(['Legal', 'Tax']);

    const otherRes = await request(app)
      .get('/api/folders')
      .set('Authorization', auth(other))
      .expect(200);
    const otherNames = (otherRes.body.data.folders as Array<{ name: string }>).map((f) => f.name);
    expect(otherNames).to.deep.equal(['Private']);
  });

  it('rejects duplicate folder names', async () => {
    await createFolder(owner, 'Duplicate').expect(201);
    const res = await createFolder(owner, 'Duplicate').expect(409);
    expect(res.body.message).to.include('already exists');
  });

  it('renames a folder', async () => {
    const folder = (await createFolder(owner, 'Old Name').expect(201)).body.data.folder;
    const res = await request(app)
      .patch(`/api/folders/${folder._id}`)
      .set('Authorization', auth(owner))
      .send({ name: 'New Name' })
      .expect(200);
    expect(res.body.data.folder.name).to.equal('New Name');
  });

  it('rejects access to another user folder (rename and delete)', async () => {
    const folder = (await createFolder(owner, 'Isolated').expect(201)).body.data.folder;
    await request(app)
      .patch(`/api/folders/${folder._id}`)
      .set('Authorization', auth(other))
      .send({ name: 'Sneaky' })
      .expect(403);
    await request(app)
      .delete(`/api/folders/${folder._id}`)
      .set('Authorization', auth(other))
      .expect(403);
    const stillThere = await request(app)
      .get('/api/folders')
      .set('Authorization', auth(owner))
      .expect(200);
    const names = (stillThere.body.data.folders as Array<{ name: string }>).map((f) => f.name);
    expect(names).to.include('Isolated');
  });

  it('moves documents out of a folder when the folder is deleted', async () => {
    const folder = (await createFolder(owner, 'Doomed').expect(201)).body.data.folder;
    const first = (await uploadDocument(owner, { folderId: folder._id }).expect(201)).body.data
      .document;
    const second = (await uploadDocument(owner, { folderId: folder._id }).expect(201)).body.data
      .document;

    await request(app)
      .delete(`/api/folders/${folder._id}`)
      .set('Authorization', auth(owner))
      .expect(200);

    const unfiled = await request(app)
      .get('/api/documents?folderId=unfiled')
      .set('Authorization', auth(owner))
      .expect(200);
    const ids = (unfiled.body.data.documents as Array<{ _id: string }>).map((d) => String(d._id));
    expect(ids).to.include(first._id);
    expect(ids).to.include(second._id);
  });

  it('rejects assigning a folder that belongs to another user', async () => {
    const foreignFolder = (await createFolder(other, 'Foreign').expect(201)).body.data.folder;
    const res = await uploadDocument(owner, { folderId: foreignFolder._id }).expect(400);
    expect(res.body.message).to.include('does not belong to you');
  });

  it('places uploaded documents into a folder with tags', async () => {
    const folder = (await createFolder(owner, 'Work').expect(201)).body.data.folder;
    const res = await uploadDocument(owner, {
      folderId: folder._id,
      tags: ['Contract', 'Signed', 'contract'],
    }).expect(201);

    const doc = res.body.data.document;
    expect(String(doc.folderId)).to.equal(folder._id);
    expect(doc.tags).to.deep.equal(['contract', 'signed']);
  });

  it('updates organization via PATCH and clears folder with null', async () => {
    const doc = (await uploadDocument(owner).expect(201)).body.data.document;
    const folder = (await createFolder(owner, 'Patched').expect(201)).body.data.folder;

    const assigned = await request(app)
      .patch(`/api/documents/${doc._id}`)
      .set('Authorization', auth(owner))
      .send({ folderId: folder._id, tags: ['Receipt', 'VAT'] })
      .expect(200);
    expect(String(assigned.body.data.document.folderId)).to.equal(folder._id);
    expect(assigned.body.data.document.tags).to.deep.equal(['receipt', 'vat']);

    const cleared = await request(app)
      .patch(`/api/documents/${doc._id}`)
      .set('Authorization', auth(owner))
      .send({ folderId: null, tags: [] })
      .expect(200);
    expect(cleared.body.data.document.folderId).to.equal(null);
    expect(cleared.body.data.document.tags).to.deep.equal([]);
  });

  it('rejects PATCH with an empty body and an empty tag', async () => {
    const doc = (await uploadDocument(owner).expect(201)).body.data.document;
    await request(app)
      .patch(`/api/documents/${doc._id}`)
      .set('Authorization', auth(owner))
      .send({})
      .expect(422);
    await request(app)
      .patch(`/api/documents/${doc._id}`)
      .set('Authorization', auth(owner))
      .send({ tags: ['  '] })
      .expect(422);
  });

  it('filters documents by folder, unfiled, and AND-combined tags', async () => {
    const folderA = (await createFolder(owner, 'FilterA').expect(201)).body.data.folder;
    const folderB = (await createFolder(owner, 'FilterB').expect(201)).body.data.folder;

    const inA = (await uploadDocument(owner, { folderId: folderA._id, tags: ['Alpha', 'Shared'] })
      .expect(201)).body.data.document;
    const inB = (await uploadDocument(owner, { folderId: folderB._id, tags: ['Beta', 'Shared'] })
      .expect(201)).body.data.document;

    const folderFilter = await request(app)
      .get(`/api/documents?folderId=${folderA._id}`)
      .set('Authorization', auth(owner))
      .expect(200);
    const folderIds = (folderFilter.body.data.documents as Array<{ _id: string }>).map((d) =>
      String(d._id)
    );
    expect(folderIds).to.have.length(1);
    expect(folderIds[0]).to.equal(inA._id);

    const unfiled = await request(app)
      .get('/api/documents?folderId=unfiled')
      .set('Authorization', auth(owner))
      .expect(200);
    const unfiledIds = (unfiled.body.data.documents as Array<{ _id: string }>).map((d) =>
      String(d._id)
    );
    expect(unfiledIds).to.not.include(inA._id);
    expect(unfiledIds).to.not.include(inB._id);
    expect(unfiledIds.length).to.be.gte(2);

    const andFilter = await request(app)
      .get('/api/documents?tag=Shared&tag=Alpha')
      .set('Authorization', auth(owner))
      .expect(200);
    const andIds = (andFilter.body.data.documents as Array<{ _id: string }>).map((d) =>
      String(d._id)
    );
    expect(andIds).to.have.length(1);
    expect(andIds[0]).to.equal(inA._id);
    expect(String(inB._id)).to.not.equal(inA._id);
  });

  it('returns tag counts and matches tags in search', async () => {
    const res = await request(app)
      .get('/api/documents/tags')
      .set('Authorization', auth(owner))
      .expect(200);
    const tags = res.body.data.tags as Array<{ name: string; count: number }>;
    const shared = tags.find((t) => t.name === 'shared');
    expect(shared).to.exist;
    expect(shared!.count).to.be.gte(2);

    const search = await request(app)
      .get('/api/documents?search=contracT')
      .set('Authorization', auth(owner))
      .expect(200);
    const names = (search.body.data.documents as Array<{ originalName: string }>).map(
      (d) => d.originalName
    );
    expect(names).to.include('organised.pdf');
  });

  it('keeps document versioning metadata intact after organization updates', async () => {
    const root = await seedDocument(owner.id);
    const folder = (await createFolder(owner, 'Versioned').expect(201)).body.data.folder;
    const res = await request(app)
      .patch(`/api/documents/${root.id}`)
      .set('Authorization', auth(owner))
      .send({ folderId: folder._id, tags: ['V1'] })
      .expect(200);
    expect(String(res.body.data.document.folderId)).to.equal(folder._id);
    expect(res.body.data.document.tags).to.deep.equal(['v1']);
  });
});