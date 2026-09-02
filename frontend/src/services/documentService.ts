import { api, unwrap, getBlobError, saveBlob } from './api';
import type {
  DocumentItem,
  DocumentListResponse,
  VerificationRecord,
} from '@/types';

export interface DocumentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const documentService = {
  async list(query: DocumentQuery = {}): Promise<DocumentListResponse> {
    const res = await api.get('/documents', { params: query });
    return unwrap<DocumentListResponse>(res.data);
  },

  async get(id: string): Promise<DocumentItem> {
    const res = await api.get(`/documents/${id}`);
    return unwrap<{ document: DocumentItem }>(res.data).document;
  },

  /** Registers an already-blockchain-confirmed document (multipart). */
  async create(payload: {
    file: File;
    originalName: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    sha256Hash: string;
    transactionHash: string;
    blockNumber?: number;
  }): Promise<DocumentItem> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('originalName', payload.originalName);
    form.append('fileName', payload.fileName);
    form.append('fileSize', String(payload.fileSize));
    form.append('mimeType', payload.mimeType);
    form.append('sha256Hash', payload.sha256Hash);
    form.append('transactionHash', payload.transactionHash);
    if (payload.blockNumber !== undefined) {
      form.append('blockNumber', String(payload.blockNumber));
    }
    const res = await api.post('/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<{ document: DocumentItem }>(res.data).document;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },

  async download(id: string, fileName: string): Promise<void> {
    try {
      const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
      saveBlob(res.data as Blob, fileName);
    } catch (err) {
      throw await getBlobError(err);
    }
  },

  verifications(id: string): Promise<VerificationRecord[]> {
    return api
      .get(`/verification/${id}`)
      .then((res) => unwrap<{ verifications: VerificationRecord[] }>(res.data).verifications);
  },
};
