import { api, unwrap } from './api';
import type {
  ActivityLogItem,
  AdminAnalytics,
  DocumentItem,
  DocumentListResponse,
  User,
} from '@/types';

export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: string;
}

interface ListEnvelope<T> {
  [key: string]: T[] | { page: number; limit: number; total: number; totalPages: number };
}

const paginationOf = (data: Record<string, unknown>) =>
  data.pagination as { page: number; limit: number; total: number; totalPages: number };

export const adminService = {
  async users(query: UserQuery = {}) {
    const res = await api.get('/admin/users', { params: query });
    const data = unwrap<ListEnvelope<User>>(res.data) as unknown as {
      users: User[];
      pagination: ReturnType<typeof paginationOf>;
    };
    return data;
  },

  async setUserRole(id: string, role: 'USER' | 'ADMIN'): Promise<User> {
    const res = await api.put(`/admin/users/${id}/role`, { role });
    return unwrap<{ user: User }>(res.data).user;
  },

  async setUserStatus(id: string, isActive: boolean): Promise<User> {
    const res = await api.put(`/admin/users/${id}/status`, { isActive });
    return unwrap<{ user: User }>(res.data).user;
  },

  async documents(query: { page?: number; limit?: number; search?: string; status?: string } = {}): Promise<DocumentListResponse> {
    const res = await api.get('/admin/documents', { params: query });
    return unwrap(res.data);
  },

  async transactions(): Promise<DocumentItem[]> {
    const res = await api.get('/admin/transactions');
    return unwrap<{ transactions: DocumentItem[] }>(res.data).transactions;
  },

  async analytics(): Promise<AdminAnalytics> {
    const res = await api.get('/admin/analytics');
    return unwrap(res.data);
  },

  async activityLogs(query: { page?: number; limit?: number; action?: string } = {}) {
    const res = await api.get('/admin/activity-logs', { params: query });
    const data = unwrap<ListEnvelope<ActivityLogItem>>(res.data) as unknown as {
      logs: ActivityLogItem[];
      pagination: ReturnType<typeof paginationOf>;
    };
    return data;
  },
};
