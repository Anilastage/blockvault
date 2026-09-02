import { api, unwrap } from './api';
import type { NotificationListResponse } from '@/types';

export const notificationService = {
  async list(params: { page?: number; limit?: number; unread?: boolean } = {}): Promise<NotificationListResponse> {
    const res = await api.get('/notifications', { params });
    return unwrap<NotificationListResponse>(res.data);
  },

  async unreadCount(): Promise<number> {
    const res = await api.get('/notifications/unread-count');
    return unwrap<{ count: number }>(res.data).count;
  },

  async markRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<number> {
    const res = await api.post('/notifications/read-all');
    return unwrap<{ marked: number }>(res.data).marked;
  },
};