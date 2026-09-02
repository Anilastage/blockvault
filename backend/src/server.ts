import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/db';

const summarizeEnv = (): void => {
  console.log(`[config] NODE_ENV=${env.nodeEnv}`);
  if (!env.isProd) return;
  if (env.blockchain.contractAddress) {
    console.log(
      `[config] contract=${env.blockchain.contractAddress} chainId=${env.blockchain.chainId} explorer=${env.blockchain.explorerUrl || '(none)'}`
    );
  } else {
    console.warn('[config] CONTRACT_ADDRESS not set — deploy the contract and set it in .env');
  }
  if (env.email.smtpHost) {
    console.log(`[config] SMTP=${env.email.smtpHost}:${env.email.smtpPort} from=${env.email.fromAddress}`);
  } else {
    console.warn('[config] SMTP not configured — email OTP delivery disabled');
  }
};

const start = async (): Promise<void> => {
  summarizeEnv();

  try {
    await connectDatabase();
    console.log('[db] MongoDB connection established');
  } catch (err) {
    console.error('[db] Failed to connect to MongoDB:', (err as Error).message);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] BlockVault API running on http://localhost:${env.port}`);
    if (!env.blockchain.contractAddress) {
      console.warn('[blockchain] CONTRACT_ADDRESS not set — deploy the contract and update .env');
    }
  });
};

start();
