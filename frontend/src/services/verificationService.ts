import { api, unwrap, getBlobError, saveBlob } from './api';
import type { VerificationRecord, VerifyOutcome } from '@/types';

export const verificationService = {
  async verifyByHash(hash: string, documentId?: string): Promise<VerifyOutcome> {
    const res = await api.post('/verification/hash', { hash, documentId });
    return unwrap<VerifyOutcome>(res.data);
  },

  /** Public, no-auth variant used by the shared verification page. */
  async verifyByHashPublic(hash: string, documentId?: string): Promise<VerifyOutcome> {
    const res = await api.post('/verification/public/hash', { hash, documentId });
    return unwrap<VerifyOutcome>(res.data);
  },

  async verifyUploadedFile(file: File, documentId?: string): Promise<VerifyOutcome> {
    const form = new FormData();
    form.append('file', file);
    if (documentId) form.append('documentId', documentId);
    const res = await api.post('/verification/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<VerifyOutcome>(res.data);
  },

  /** Public, no-auth variant used by the shared verification page. */
  async verifyUploadedFilePublic(file: File, documentId?: string): Promise<VerifyOutcome> {
    const form = new FormData();
    form.append('file', file);
    if (documentId) form.append('documentId', documentId);
    const res = await api.post('/verification/public/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<VerifyOutcome>(res.data);
  },

  async history(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sortOrder?: 'asc' | 'desc';
    from?: string;
    to?: string;
  } = {}): Promise<{
    verifications: VerificationRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await api.get('/verification/history', { params: query });
    return unwrap(res.data);
  },

  /** Downloads the original document stored for a verified record. */
  async download(documentId: string, fileName: string): Promise<void> {
    try {
      const res = await api.get(`/verification/download/${documentId}`, { responseType: 'blob' });
      saveBlob(res.data as Blob, fileName);
    } catch (err) {
      throw await getBlobError(err);
    }
  },
};
