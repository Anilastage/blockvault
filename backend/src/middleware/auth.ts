import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from './errorHandler';
import type { AuthUser } from '../types';

export interface JwtPayload {
  id: string;
  role: 'USER' | 'ADMIN';
  email: string;
}

export const signToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);

/** Resolve a JWT to a fresh user record, or null when invalid/disabled. */
export const resolveToken = async (token: string): Promise<AuthUser | null> => {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    return null;
  }
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return null;
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
};

export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authentication required. Please log in.');
  }
  const token = header.slice(7);
  const user = await resolveToken(token);
  if (!user) {
    throw ApiError.unauthorized('Invalid or expired authentication token.');
  }
  req.user = user;
  next();
});

/**
 * Authentication for Server-Sent Events: the browser EventSource API cannot
 * set an Authorization header, so the token may also be passed as a query
 * parameter (`?token=`).
 */
export const protectStream = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query.token as string | undefined);

  if (!token) {
    throw ApiError.unauthorized('Authentication required. Please log in.');
  }
  const user = await resolveToken(token);
  if (!user) {
    throw ApiError.unauthorized('Invalid or expired authentication token.');
  }
  req.user = user;
  next();
});

export const adminOnly = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('Admin access required.'));
  }
  next();
};
