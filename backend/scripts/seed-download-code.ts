import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  const { DocumentModel } = await import('../src/models/Document');
  const { DownloadCode } = await import('../src/models/DownloadCode');

  const doc = await DocumentModel.findOne({ blockchainStatus: 'CONFIRMED' }).sort({ _id: 1 });
  if (!doc) {
    console.log('No confirmed document found.');
    await mongoose.disconnect();
    return;
  }
  console.log('Using doc:', doc._id, doc.originalName, doc.sha256Hash);

  const code = 'TESTCODE1';
  await DownloadCode.findOneAndUpdate(
    { documentId: doc._id },
    { code, expiresAt: new Date(Date.now() + 20 * 60 * 1000) },
    { upsert: true, new: true }
  );
  console.log('Seeded share code TESTCODE1 ->', doc._id);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
