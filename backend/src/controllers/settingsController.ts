import type { Request, Response } from 'express';
import { UserSettings } from '../models/UserSettings';
import { asyncHandler } from '../middleware/errorHandler';
import { z } from 'zod';

export const settingsPatchSchema = z.object({
  general: z
    .object({
      language: z.string().max(10),
      timezone: z.string().max(64),
      dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    })
    .partial()
    .optional(),
  notifications: z
    .object({
      emailNotifications: z.boolean(),
      verificationAlerts: z.boolean(),
      transactionAlerts: z.boolean(),
      securityAlerts: z.boolean(),
      systemUpdates: z.boolean(),
    })
    .partial()
    .optional(),
  appearance: z
    .object({
      theme: z.enum(['light', 'dark', 'system']),
    })
    .partial()
    .optional(),
});

const ensureSettings = async (userId: string) => {
  let settings = await UserSettings.findOne({ userId });
  if (!settings) {
    settings = await UserSettings.create({ userId });
  }
  return settings;
};

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await ensureSettings(String(req.user!.id));
  res.json({ success: true, message: 'Settings retrieved', data: { settings } });
});

export const patchSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await ensureSettings(String(req.user!.id));

  if (req.body.general) Object.assign(settings.general, req.body.general);
  if (req.body.notifications) Object.assign(settings.notifications, req.body.notifications);
  if (req.body.appearance) Object.assign(settings.appearance, req.body.appearance);

  await settings.save();
  res.json({ success: true, message: 'Settings updated', data: { settings } });
});
