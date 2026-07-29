import type { Readable } from "stream";
import { minioClient } from "@/lib/minio";
import type { DocumentDownloadPort, DocumentStagingPort } from "@/server/services/provider-document.service";

/**
 * PNOS F2.6 — MinIO-backed private document storage adapter.
 *
 * Implements the download (presignRead) + staging (stat/read/promote) ports. The
 * signed GET URL is time-limited (minute-scale) — never a permanent public URL.
 * The private-bucket cutover (removing public read) is F2.9 (gated); this
 * adapter works against the configured bucket regardless.
 */
const DOCUMENTS_BUCKET = process.env.MINIO_DOCUMENTS_BUCKET || "aicare-documents";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export const minioDocumentPort: DocumentDownloadPort & DocumentStagingPort = {
  async presignRead(key, ttlSeconds) {
    const url = await minioClient.presignedGetObject(DOCUMENTS_BUCKET, key, ttlSeconds);
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  },
  async stat(key) {
    try {
      const s = await minioClient.statObject(DOCUMENTS_BUCKET, key);
      return { exists: true, size: s.size };
    } catch {
      return { exists: false, size: 0 };
    }
  },
  async read(key) {
    const stream = (await minioClient.getObject(DOCUMENTS_BUCKET, key)) as unknown as Readable;
    return streamToBuffer(stream);
  },
  async promote(stagingKey, finalKey) {
    // copy staging → final private key, then drop the staging object
    await minioClient.copyObject(DOCUMENTS_BUCKET, finalKey, `/${DOCUMENTS_BUCKET}/${stagingKey}`);
    await minioClient.removeObject(DOCUMENTS_BUCKET, stagingKey);
  },
};
