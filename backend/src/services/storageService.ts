import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Storage abstraction so the backing store can be swapped (S3, Cloudinary,
 * GCS) without touching controllers. The local disk provider is the default.
 */
export interface StoredFile {
  fileName: string;
  storagePath: string;
}

export interface StorageProvider {
  save(buffer: Buffer, originalName: string): Promise<StoredFile>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

class LocalDiskStorage implements StorageProvider {
  constructor(private baseDir: string) {}

  private resolve(fileName: string): string {
    const resolved = path.resolve(this.baseDir, path.basename(fileName));
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error('Invalid storage path');
    }
    return resolved;
  }

  async save(buffer: Buffer, _originalName: string): Promise<StoredFile> {
    const fileName = `${Date.now()}-${crypto.randomUUID()}`;
    const storagePath = this.resolve(fileName);
    await fs.writeFile(storagePath, buffer);
    return { fileName, storagePath };
  }

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(this.resolve(storagePath)).catch(() => undefined);
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(storagePath));
      return true;
    } catch {
      return false;
    }
  }
}

export const storageProvider: StorageProvider = new LocalDiskStorage(
  path.resolve(process.cwd(), 'uploads')
);
