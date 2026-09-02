import { api, unwrap, getBlobError, saveBlob } from './api';
import type { DownloadCodeInfo } from '@/types';

export const downloadCodeService = {
  /** Owner/admin: fetch the current share-able code for a document. */
  async get(documentId: string): Promise<DownloadCodeInfo> {
    const res = await api.get(`/documents/${documentId}/download-code`);
    return unwrap<{ downloadCode: DownloadCodeInfo }>(res.data).downloadCode;
  },

  /** Owner/admin: force a brand-new code immediately. */
  async regenerate(documentId: string): Promise<DownloadCodeInfo> {
    const res = await api.post(`/documents/${documentId}/download-code/regenerate`);
    return unwrap<{ downloadCode: DownloadCodeInfo }>(res.data).downloadCode;
  },

  /**
   * Public: submit a share code and download the matching document. No login
   * required — the rotating code is the credential.
   */
  async downloadByCode(code: string): Promise<void> {
    try {
      const res = await api.post('/download/code', { code }, { responseType: 'blob' });
      saveBlob(res.data as Blob, `document-${code}.${extFromType((res.data as Blob).type)}`);
    } catch (err) {
      // Blob responses swallow the server's JSON error body; unwrap it.
      throw await getBlobError(err);
    }
  },
};

function extFromType(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'application/zip': 'zip',
  };
  return map[mime] ?? 'bin';
}
