import { api, unwrap } from './api';
import type { User, UserSettings } from '@/types';

export const userService = {
  async settings(): Promise<UserSettings> {
    const res = await api.get('/users/settings');
    return unwrap<{ settings: UserSettings }>(res.data).settings;
  },

  async updateSettings(patch: {
    general?: Partial<UserSettings['general']>;
    notifications?: Partial<UserSettings['notifications']>;
    appearance?: Partial<UserSettings['appearance']>;
  }): Promise<UserSettings> {
    const res = await api.patch('/users/settings', patch);
    return unwrap<{ settings: UserSettings }>(res.data).settings;
  },

  async deleteAccount(password: string): Promise<void> {
    await api.delete('/users/account', { data: { password } });
  },

  async profile(): Promise<User> {
    const res = await api.get('/users/profile');
    return unwrap<{ user: User }>(res.data).user;
  },
};
