import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const { User } = await import('../src/models/User');
  const email = process.argv[2] || 'testverify@example.com';
  const u = await User.findOneAndUpdate({ email }, { $set: { role: 'ADMIN' } }, { new: true });
  console.log(u ? `promoted: ${u.email} role=${u.role}` : 'not found');
  await mongoose.disconnect();
}
main();
