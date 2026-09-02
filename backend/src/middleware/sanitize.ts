import type { Request, Response, NextFunction } from 'express';

const cleaned: Record<string, boolean> = {
  __proto__: true,
  prototype: true,
  constructor: true,
};

/**
 * Basic MongoDB operator injection guard: strips keys starting with `$`
 * or containing `.` from body/query/params before they reach controllers.
 */
const clean = (obj: unknown): void => {
  if (typeof obj !== 'object' || obj === null) return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (cleaned[key] || key.startsWith('$') || key.includes('.')) {
      delete (obj as Record<string, unknown>)[key];
    } else {
      clean((obj as Record<string, unknown>)[key]);
    }
  }
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') clean(req.body);
  if (req.query && typeof req.query === 'object') clean(req.query);
  if (req.params && typeof req.params === 'object') clean(req.params);
  next();
};
