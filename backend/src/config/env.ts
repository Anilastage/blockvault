import dotenv from 'dotenv';

dotenv.config();

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const knownFallbacks = new Set([
  'change-me-to-a-long-random-string',
  'dev-only-secret-change-me-in-production',
  'blockvault-dev-secret-2f8a41c9e7b3d604',
]);

const envIsProd = process.env.NODE_ENV === 'production';

const jwtSecret =
  process.env.NODE_ENV === 'production'
    ? required('JWT_SECRET') // no fallback in production — a known default is unsafe
    : (process.env.JWT_SECRET ?? 'dev-only-secret-change-me-in-production');

// Reject weak/known secrets in production so a misconfiguration can never run
// with a predictable JWT signing key. In dev/test the placeholder fallback is
// expected and harmless.
if (envIsProd && knownFallbacks.has(jwtSecret)) {
  throw new Error('JWT_SECRET is set to a known default value. Generate a long, unique random secret.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInt(process.env.PORT ?? '5000', 10),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/blockvault'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  blockchain: {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL ?? 'http://127.0.0.1:8545',
    contractAddress: process.env.CONTRACT_ADDRESS ?? '',
    explorerUrl: process.env.BLOCKCHAIN_EXPLORER_URL ?? '',
    chainId: parseInt(process.env.CHAIN_ID ?? '31337', 10),
  },
  upload: {
    // Slightly above the 10 MB plaintext limit to fit AES-GCM ciphertext.
    maxFileSizeMb: 12,
    dir: 'uploads',
  },
  email: {
    // Resend is preferred: it is an HTTPS API, so it works on Render's free
    // tier where outbound SMTP ports are blocked. SMTP remains a fallback.
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    resendApiUrl: process.env.RESEND_API_URL ?? 'https://api.resend.com/emails',
    smtpEnabled: process.env.SMTP_ENABLED === 'true',
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    fromName: process.env.EMAIL_FROM_NAME ?? 'BlockVault',
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? '',
  },
  sms: {
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  },
};
