import { api, unwrap, getBlobError } from './api';
import { saveDownloadResponse } from '@/utils/encryptedDownload';
import { sha256File } from '@/utils/hash';
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
    const hash = await sha256File(file);
    return this.verifyByHash(hash, documentId);
  },

  /** Public, no-auth variant used by the shared verification page. */
  async verifyUploadedFilePublic(file: File, documentId?: string): Promise<VerifyOutcome> {
    const hash = await sha256File(file);
    return this.verifyByHashPublic(hash, documentId);
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
      await saveDownloadResponse(res, fileName);
    } catch (err) {
      throw await getBlobError(err);
    }
  },
};

