import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getTempUploadsDir } from '../../utils/paths.js';

export interface StoredDocument {
  id: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  sizeBytes: number;
  uploadedAt: string;
}

export class FileStorageService {
  private tempDir: string;
  private documentRegistry = new Map<string, StoredDocument>();

  constructor(customDir?: string) {
    this.tempDir = customDir || getTempUploadsDir();
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  saveTempFile(buffer: Buffer, originalName: string, mimeType: string): StoredDocument {
    const id = randomUUID();
    const safeExt = path.extname(originalName).toLowerCase() || (mimeType === 'application/pdf' ? '.pdf' : '.png');
    const safeFileName = `${id}${safeExt}`;
    const filePath = path.join(this.tempDir, safeFileName);

    fs.writeFileSync(filePath, buffer);

    const doc: StoredDocument = {
      id,
      originalName,
      mimeType,
      filePath,
      sizeBytes: buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    this.documentRegistry.set(id, doc);
    return doc;
  }

  getDocument(id: string): StoredDocument | null {
    const doc = this.documentRegistry.get(id);
    if (!doc) return null;
    if (!fs.existsSync(doc.filePath)) return null;
    return doc;
  }

  deleteTempFile(id: string): boolean {
    const doc = this.documentRegistry.get(id);
    if (!doc) return false;

    try {
      if (fs.existsSync(doc.filePath)) {
        fs.unlinkSync(doc.filePath);
      }
      this.documentRegistry.delete(id);
      return true;
    } catch (err) {
      console.error(`Failed to delete temporary file ${doc.filePath}:`, err);
      return false;
    }
  }

  cleanupExpired(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, doc] of this.documentRegistry.entries()) {
      const age = now - new Date(doc.uploadedAt).getTime();
      if (age > maxAgeMs) {
        this.deleteTempFile(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}
