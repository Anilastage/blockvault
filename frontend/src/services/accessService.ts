import { api, unwrap, getBlobError } from './api';
import { saveDownloadResponse } from '@/utils/encryptedDownload';
import type { AccessRequestItem, DownloadRecordItem } from '@/types';

export const accessService = {
  /** Ask the document owner for permission to download a copy. */
  async request(documentId: string, reason?: string): Promise<AccessRequestItem> {
    const res = await api.post('/access/requests', { documentId, reason });
    return unwrap<{ request: AccessRequestItem }>(res.data).request;
  },

  async myRequests(params: {
    status?: string;
    documentId?: string;
  } = {}): Promise<AccessRequestItem[]> {
    const res = await api.get('/access/requests/mine', { params });
    return unwrap<{ requests: AccessRequestItem[] }>(res.data).requests;
  },

  async incoming(status = 'PENDING'): Promise<AccessRequestItem[]> {
    const res = await api.get('/access/requests', { params: { status } });
    return unwrap<{ requests: AccessRequestItem[] }>(res.data).requests;
  },

  async approve(id: string, requesterWrappedKey?: string): Promise<AccessRequestItem> {
    const res = await api.post(`/access/requests/${id}/approve`, { requesterWrappedKey });
    return unwrap<{ request: AccessRequestItem }>(res.data).request;
  },

  async deny(id: string): Promise<AccessRequestItem> {
    const res = await api.post(`/access/requests/${id}/deny`);
    return unwrap<{ request: AccessRequestItem }>(res.data).request;
  },

  /** Consumes the one-time token and streams the file to the browser. */
  async downloadWithToken(token: string, fileName: string): Promise<void> {
    try {
      const res = await api.get(`/access/requests/${token}/download`, { responseType: 'blob' });
      await saveDownloadResponse(res, fileName);
    } catch (err) {
      throw await getBlobError(err);
    }
  },

  /** Audit trail of downloads for a document (owner/admin only). */
  async downloads(documentId: string): Promise<DownloadRecordItem[]> {
    const res = await api.get(`/documents/${documentId}/downloads`);
    return unwrap<{ downloads: DownloadRecordItem[] }>(res.data).downloads;
  },
};
