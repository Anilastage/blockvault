import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const { DownloadCode } = await import('../src/models/DownloadCode');
  const { DocumentModel } = await import('../src/models/Document');
  const { DownloadRecord } = await import('../src/models/DownloadRecord');
  const { logActivity, clientMeta } = await import('../src/services/activityService');
  const { createNotification } = await import('../src/services/notificationService');
  const { storageProvider } = await import('../src/services/storageService');

  try {
    const record = await DownloadCode.findOne({ code: 'TESTCODE1' });
    console.log('record:', record ? { code: record.code, expiresAt: record.expiresAt } : null);
    if (!record) throw new Error('no record');
    const doc = await DocumentModel.findById(record.documentId);
    console.log('doc:', doc ? { id: doc._id, name: doc.originalName, status: doc.blockchainStatus, storagePath: doc.storagePath } : null);
    if (!doc) throw new Error('no doc');
    const exists = await storageProvider.exists(doc.storagePath);
    console.log('exists on disk:', exists);

    await DownloadRecord.create({
      documentId: doc._id,
      requesterId: undefined,
      method: 'SHARE_CODE',
      ...clientMeta('127.0.0.1', 'test'),
    });
    console.log('DownloadRecord created');

    await logActivity({
      userId: undefined,
      action: 'DOCUMENT_DOWNLOAD',
      entityType: 'DOCUMENT',
      entityId: String(doc._id),
      metadata: { name: doc.originalName, viaShareCode: true },
      ...clientMeta('127.0.0.1', 'test'),
    });
    console.log('logActivity created');

    await createNotification({
      userId: String(doc.userId),
      type: 'DOCUMENT_DOWNLOADED',
      title: 'test',
      message: 'test',
      entityId: String(doc._id),
    });
    console.log('notification created');
  } catch (e) {
    console.error('DIAG ERROR:', e);
  }
  await mongoose.disconnect();
}
main();
