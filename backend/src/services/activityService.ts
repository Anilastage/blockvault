import { ActivityLog } from '../models/ActivityLog';

interface LogInput {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const logActivity = async (input: LogInput): Promise<void> => {
  try {
    await ActivityLog.create(input);
  } catch (err) {
    console.error('[activity] Failed to record activity log:', err);
  }
};

export const clientMeta = (ip?: string, userAgent?: string) => ({
  ipAddress: ip?.replace('::1', '127.0.0.1').replace('::ffff:', ''),
  userAgent,
});
