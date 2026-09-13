import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env';
import { sanitizeRequest } from './middleware/sanitize';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import documentRoutes from './routes/documentRoutes';
import verificationRoutes from './routes/verificationRoutes';
import blockchainRoutes from './routes/blockchainRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import adminRoutes from './routes/adminRoutes';
import notificationRoutes from './routes/notificationRoutes';
import accessRoutes from './routes/accessRoutes';
import downloadRoutes from './routes/downloadRoutes';
import folderRoutes from './routes/folderRoutes';
import rateLimit from 'express-rate-limit';

export const createApp = (): Express => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientUrl.split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(sanitizeRequest);

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/blockchain/config'),
  });
  app.use('/api', apiLimiter);

  app.get('/health', (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
      success: dbConnected,
      message: dbConnected ? 'BlockVault API is running' : 'Database not connected',
      data: {
        uptime: process.uptime(),
        db: dbConnected ? 'connected' : 'disconnected',
        contract: env.blockchain.contractAddress ? 'configured' : 'not-set',
        chainId: env.blockchain.chainId,
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/verification', verificationRoutes);
  app.use('/api/blockchain', blockchainRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/download', downloadRoutes);
  app.use('/api/folders', folderRoutes);

  // uploads are intentionally NOT served statically; downloads go through
  // the authorized /api/documents/:id/download route only.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
  