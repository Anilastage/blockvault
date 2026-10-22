import { api, unwrap } from './api';
import type {
  VaultBundle,
  VaultPasswordEnvelope,
  VaultRecoveryStart,
} from '@/types';

export const vaultService = {
  async get(): Promise<VaultBundle | null> {
    const res = await api.get('/users/encryption');
    return unwrap<{ encryption: VaultBundle | null }>(res.data).encryption;
  },

  async setup(bundle: VaultBundle): Promise<VaultBundle> {
    const res = await api.post('/users/encryption', bundle);
    return unwrap<{ encryption: VaultBundle }>(res.data).encryption;
  },

  async updateRecovery(envelope: {
    recoveryWrappedVaultKey: string;
    recoveryWrapIv: string;
  }): Promise<void> {
    await api.put('/users/encryption/recovery', envelope);
  },

  async startRecovery(email: string): Promise<VaultRecoveryStart> {
    const res = await api.post('/auth/recover/start', { email });
    return unwrap<VaultRecoveryStart>(res.data);
  },

  async completeRecovery(payload: {
    recoveryToken: string;
    code: string;
    newPassword: string;
    recoveryWrappedVaultKey?: string;
    recoveryWrapIv?: string;
    vault?: VaultPasswordEnvelope;
  }): Promise<void> {
    await api.post('/auth/recover/complete', {
      ...payload,
      ...(payload.vault ?? {}),
      vault: undefined,
    });
  },
};
