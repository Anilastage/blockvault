import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

const config = {
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts from this IP. Please try again later.',
    errors: [],
  },
};

export const authLimiter = isTest
  ? ((req, _res, next) => next()) as ReturnType<typeof rateLimit>
  : rateLimit(config);

/** Public share-code download endpoint is unauthenticated, so bound brute-force attempts. */
export const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many download attempts from this IP. Please try again later.',
    errors: [],
  },
});
