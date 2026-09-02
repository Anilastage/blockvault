import type { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

export const validate =
  (schema: Schema, source: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next({
        issues: result.error.issues.map((i) => ({
          path: i.path.map(String),
          message: i.message,
        })),
      });
      return;
    }
    if (source === 'query') {
      Object.assign(req.query as Record<string, unknown>, result.data);
    } else {
      req[source] = result.data;
    }
    next();
  };
