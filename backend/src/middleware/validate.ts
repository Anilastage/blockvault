import type { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';
import { ApiError } from '../utils/ApiError';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

export const validate =
  (schema: Schema, source: 'body' | 'query' | 'params' = 'body', invalidStatus = 422) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.map(String),
        message: i.message,
      }));
      if (invalidStatus === 422) {
        next({ issues });
      } else {
        next(
          ApiError.badRequest(
            'Validation failed',
            issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
          )
        );
      }
      return;
    }
    if (source === 'query') {
      Object.assign(req.query as Record<string, unknown>, result.data);
    } else {
      req[source] = result.data;
    }
    next();
  };