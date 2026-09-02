import axios, { AxiosError } from 'axios';
import type { ApiEnvelope } from '@/types';

export const TOKEN_KEY = 'blockvault_token';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiEnvelope<unknown> | undefined;
    if (data?.errors?.length) return data.errors[0];
    if (data?.message) return data.message;
    if (err.code === 'ERR_NETWORK') return 'Cannot reach the BlockVault server. Is it running?';
  }
  if (err instanceof Error && err.message.includes('user rejected')) {
    return 'Transaction was rejected by the wallet.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
};

export const unwrap = <T>(payload: ApiEnvelope<T>): T => payload.data;

/**
 * Triggers a browser download for a Blob and defers revoking the object URL so
 * the browser has time to register the click before the URL is cleaned up.
 */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Blob responses swallow the server's JSON error body (the browser keeps the
 * blob opaque). Re-reads it and throws a usable Error from the JSON message.
 */
export const getBlobError = async (err: unknown): Promise<Error> => {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    const text = await err.response.data.text();
    try {
      const parsed = JSON.parse(text) as { message?: string };
      return new Error(parsed.message ?? 'Download failed');
    } catch {
      return new Error('Download failed');
    }
  }
  return err instanceof Error ? err : new Error('Download failed');
};
