import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 27017;
const DB_NAME = 'blockvault';
const DATA_DIR = resolve(process.cwd(), '.data', 'mongodb');

mkdirSync(DATA_DIR, { recursive: true });

console.log(`[dev-db] starting in-memory MongoDB on 127.0.0.1:${PORT}`);
console.log(`[dev-db] data directory: ${DATA_DIR}`);

const mongod = await MongoMemoryServer.create({
  instance: {
    port: PORT,
    ip: '127.0.0.1',
    dbName: DB_NAME,
    dbPath: DATA_DIR,
    storageEngine: 'wiredTiger',
  },
});

console.log(`[dev-db] ready at ${mongod.getUri()}`);

const shutdown = async (signal) => {
  console.log(`[dev-db] ${signal} received — stopping MongoDB...`);
  await mongod.stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
