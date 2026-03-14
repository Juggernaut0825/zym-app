import fs from 'fs';
import path from 'path';
import { StorageProvider, StoreLocalFileInput, StoredMediaObject } from './storage-provider.js';

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const;

  constructor(private readonly rootDir: string) {}

  async storeLocalFile(input: StoreLocalFileInput): Promise<StoredMediaObject> {
    const fileName = path.basename(String(input.fileName || '').trim());
    if (!fileName || fileName === '.' || fileName === '..') {
      throw new Error('Invalid local storage file name');
    }

    const sourcePath = path.resolve(String(input.absolutePath || '').trim());
    const absoluteRoot = path.resolve(this.rootDir);
    await ensureDir(absoluteRoot);

    const destinationPath = path.resolve(path.join(absoluteRoot, fileName));
    if (!destinationPath.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new Error('Invalid local storage path');
    }

    if (sourcePath !== destinationPath) {
      await fs.promises.copyFile(sourcePath, destinationPath);
    }

    return {
      provider: this.kind,
      bucket: null,
      objectKey: fileName,
      fileName,
    };
  }

  async resolveLocalRead(objectKey: string) {
    const fileName = path.basename(String(objectKey || '').trim());
    if (!fileName || fileName === '.' || fileName === '..') {
      return null;
    }

    const absoluteRoot = path.resolve(this.rootDir);
    const absolutePath = path.resolve(path.join(absoluteRoot, fileName));
    if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
      return null;
    }

    try {
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) return null;
      return { absolutePath };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async readObject(objectKey: string): Promise<Buffer> {
    const handle = await this.resolveLocalRead(objectKey);
    if (!handle) {
      throw new Error('Local media object not found');
    }
    return fs.promises.readFile(handle.absolutePath);
  }

  async writeObject(objectKey: string, body: Buffer): Promise<void> {
    const fileName = path.basename(String(objectKey || '').trim());
    if (!fileName || fileName === '.' || fileName === '..') {
      throw new Error('Invalid local storage write path');
    }

    const absoluteRoot = path.resolve(this.rootDir);
    await ensureDir(absoluteRoot);
    const destinationPath = path.resolve(path.join(absoluteRoot, fileName));
    if (!destinationPath.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new Error('Invalid local storage write path');
    }
    await fs.promises.writeFile(destinationPath, body);
  }

  async objectExists(objectKey: string): Promise<boolean> {
    const handle = await this.resolveLocalRead(objectKey);
    return Boolean(handle);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const handle = await this.resolveLocalRead(objectKey);
    if (!handle) return;
    try {
      await fs.promises.unlink(handle.absolutePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
