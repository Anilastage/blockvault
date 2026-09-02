import type { Response } from 'express';
import { Notification, type INotification, type NotificationType } from '../models/Notification';

interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** userId (as string) => set of currently-open SSE responses. */
const subscriptions = new Map<string, Set<Response>>();

const getChannel = (userId: string): Set<Response> => {
  let channel = subscriptions.get(userId);
  if (!channel) {
    channel = new Set();
    subscriptions.set(userId, channel);
  }
  return channel;
};

const prune = (userId: string): void => {
  const channel = subscriptions.get(userId);
  if (channel && channel.size === 0) subscriptions.delete(userId);
};

/** Persist a notification and push it live to any open SSE stream. */
export const createNotification = async (input: NotificationInput): Promise<INotification> => {
  const notification = await Notification.create(input);
  const payload = notification.toObject();
  const channel = subscriptions.get(String(notification.userId));
  if (channel) {
    const frame = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of channel) {
      try {
        res.write(frame);
      } catch {
        // Stream may have closed between writes; ignore.
      }
    }
  }
  return notification;
};

/**
 * Notify a document owner when a third party verifies their document. No-op
 * (returns null) when a user verifies their own document.
 */
export const notifyDocumentVerified = async (input: {
  ownerId: string;
  documentId: string;
  documentName: string;
  verifierId: string;
  verifierName: string;
  hash: string;
}): Promise<INotification | null> => {
  if (String(input.ownerId) === String(input.verifierId)) return null;
  return createNotification({
    userId: input.ownerId,
    type: 'DOCUMENT_VERIFIED',
    title: 'Your document was verified',
    message: `${input.verifierName} verified "${input.documentName}" against the blockchain record (result: VERIFIED).`,
    entityId: input.documentId,
    metadata: { verifierId: input.verifierId, hash: input.hash },
  });
};

/** Upgrade the connection to a Server-Sent Events stream for the user. */
export const subscribeStream = (userId: string, res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  const channel = getChannel(userId);
  channel.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* noop */
    }
  }, 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    channel.delete(res);
    try {
      res.end();
    } catch {
      /* noop */
    }
    prune(userId);
  });
};