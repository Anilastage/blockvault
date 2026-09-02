import { api, unwrap } from './api';
import type { ActivityLogItem } from '@/types';

interface ActivityLogListResponse {
  logs: ActivityLogItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const activityService = {
  async list(query: { page?: number; limit?: number; action?: string } = {}): Promise<ActivityLogListResponse> {
    const res = await api.get('/dashboard/activity-logs', { params: query });
    return unwrap<ActivityLogListResponse>(res.data);
  },
};