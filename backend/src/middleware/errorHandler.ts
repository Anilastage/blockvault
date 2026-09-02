import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  const errors: string[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors.push(...err.errors);
  } else if (isZodError(err)) {
    statusCode = 422;
    message = 'Validation failed';
    errors.push(...err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`));
  } else if (hasName(err) && err.name === 'ValidationError' && hasErrors(err)) {
    statusCode = 422;
    message = 'Validation failed';
    for (const key of Object.keys(err.errors)) {
      errors.push(`${key}: ${(err.errors[key] as { message?: string }).message ?? 'invalid'}`);
    }
  } else if (hasCode(err)) {
    if (err.code === 11000 && hasKeyValue(err)) {
      statusCode = 409;
      const field = Object.keys(err.keyValue)[0];
      message = `A record with this ${field} already exists`;
      errors.push(`${field} must be unique`);
    } else if (err.code === '23505') {
      statusCode = 409;
      message = 'Duplicate record';
    } else if (
      (typeof err.code === 'string' && err.code.startsWith('LIMIT_FILE')) ||
      (typeof err.code === 'string' && err.code === 'LIMIT_UNEXPECTED_FILE')
    ) {
      statusCode = 400;
      message = mapMulterError(String(err.code));
    }
  } else if (hasName(err) && err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (hasName(err) && err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired. Please log in again.';
  } else if (hasMessage(err) && err.message.includes('ECONNREFUSED')) {
    statusCode = 503;
    message =
      'Blockchain node is unreachable. Please ensure the blockchain RPC endpoint is running.';
  }

  if (statusCode >= 500 && !env.isProd) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length ? { errors } : {}),
  });
};

interface HasName {
  name?: string;
}
const hasName = (e: unknown): e is HasName =>
  typeof e === 'object' && e !== null && 'name' in e && typeof (e as HasName).name === 'string';

interface HasCode {
  code?: string | number;
}
const hasCode = (e: unknown): e is HasCode =>
  typeof e === 'object' && e !== null && 'code' in e;

interface HasErrors {
  errors: Record<string, unknown>;
}
const hasErrors = (e: unknown): e is HasErrors & HasName =>
  typeof e === 'object' &&
  e !== null &&
  'errors' in e &&
  typeof (e as { errors?: unknown }).errors === 'object';

interface HasKeyValue {
  keyValue: Record<string, unknown>;
}
const hasKeyValue = (e: unknown): e is HasKeyValue =>
  typeof e === 'object' && e !== null && 'keyValue' in e;

interface HasMessage {
  message: string;
}
const hasMessage = (e: unknown): e is HasMessage =>
  typeof e === 'object' && e !== null && 'message' in e && typeof (e as HasMessage).message === 'string';

interface ZodLike {
  issues: Array<{ path: Array<string | number | symbol>; message: string }>;
}
const isZodError = (e: unknown): e is ZodLike =>
  typeof e === 'object' &&
  e !== null &&
  'issues' in e &&
  Array.isArray((e as ZodLike).issues);

const mapMulterError = (code: string): string => {
  switch (code) {
    case 'LIMIT_FILE_SIZE':
      return `File is too large. Maximum size is ${env.upload.maxFileSizeMb} MB.`;
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded at once.';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field.';
    default:
      return 'File upload failed.';
  }
};
