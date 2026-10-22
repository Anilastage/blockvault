import { api, unwrap, getBlobError } from './api';
import { saveDownloadResponse } from '@/utils/encryptedDownload';
import type {
  DocumentItem,
  DocumentListResponse,
  DocumentVersion,
  Folder,
  TagCount,
  VerificationRecord,
} from '@/types';

export interface DocumentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  folderId?: string;
  tag?: string | string[];
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

  /** Saves an uploaded document. Omitting transactionHash stores it as PENDING.
   * Setting parentId records it as the next revision of an existing document. */
  async create(payload: {
    file: File;
    originalName: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    sha256Hash: string;
    transactionHash?: string;
    blockNumber?: number;
    parentId?: string;
    encryption?: {
      iv: string;
      wrappedKey: string;
      keyIv: string;
      ciphertextHash: string;
      ciphertextSize: number;
    };
  }): Promise<DocumentItem> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('originalName', payload.originalName);
    form.append('fileName', payload.fileName);
    form.append('fileSize', String(payload.fileSize));
    form.append('mimeType', payload.mimeType);
    form.append('sha256Hash', payload.sha256Hash);
    if (payload.transactionHash) form.append('transactionHash', payload.transactionHash);
    if (payload.blockNumber !== undefined) {
      form.append('blockNumber', String(payload.blockNumber));
    }
    if (payload.parentId) form.append('parentId', payload.parentId);
    if (payload.encryption) {
      form.append('encrypted', 'true');
      form.append('encryptionIv', payload.encryption.iv);
      form.append('encryptionWrappedKey', payload.encryption.wrappedKey);
      form.append('encryptionKeyIv', payload.encryption.keyIv);
      form.append('ciphertextHash', payload.encryption.ciphertextHash);
      form.append('ciphertextSize', String(payload.encryption.ciphertextSize));
    }
    const res = await api.post('/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<{ document: DocumentItem }>(res.data).document;
  },

  /** Full version history of a document family, oldest first. */
  async versions(id: string): Promise<{
    familyId: string;
    currentVersion: number;
    versions: DocumentVersion[];
  }> {
    const res = await api.get(`/documents/${id}/versions`);
    return unwrap<{ familyId: string; currentVersion: number; versions: DocumentVersion[] }>(
      res.data
    );
  },

  /** Confirms a PENDING document once its hash has been registered on-chain. */
  async register(
    id: string,
    payload: { transactionHash: string; blockNumber?: number }
  ): Promise<DocumentItem> {
    const res = await api.post(`/documents/${id}/register`, payload);
    return unwrap<{ document: DocumentItem }>(res.data).document;
  },

  async updateOrganization(
    id: string,
    payload: { folderId?: string | null; tags?: string[] }
  ): Promise<DocumentItem> {
    const clean: Record<string, unknown> = {};
    if (payload.folderId !== undefined) clean.folderId = payload.folderId;
    if (payload.tags !== undefined) clean.tags = payload.tags;
    const res = await api.patch(`/documents/${id}`, clean);
    return unwrap<{ document: DocumentItem }>(res.data).document;
  },

  async tags(): Promise<TagCount[]> {
    const res = await api.get('/documents/tags');
    return unwrap<{ tags: TagCount[] }>(res.data).tags;
  },

  async listFolders(): Promise<Folder[]> {
    const res = await api.get('/folders');
    return unwrap<{ folders: Folder[] }>(res.data).folders;
  },

  async createFolder(name: string): Promise<Folder> {
    const res = await api.post('/folders', { name });
    return unwrap<{ folder: Folder }>(res.data).folder;
  },

  async renameFolder(id: string, name: string): Promise<Folder> {
    const res = await api.patch(`/folders/${id}`, { name });
    return unwrap<{ folder: Folder }>(res.data).folder;
  },

  async deleteFolder(id: string): Promise<void> {
    await api.delete(`/folders/${id}`);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },

  async setShareKey(
    id: string,
    payload: {
      shareKeyWrapped: string;
      shareKeyWrapIv: string;
      shareDekWrapped: string;
      shareDekIv: string;
    }
  ): Promise<void> {
    await api.put(`/documents/${id}/share-key`, payload);
  },

  async download(id: string, fileName: string): Promise<void> {
    try {
      const res = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
      await saveDownloadResponse(res, fileName);
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

