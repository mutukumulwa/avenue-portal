import * as Minio from "minio";

// We use the docker-compose environment variables here
export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: process.env.NODE_ENV === "production",
  accessKey: process.env.MINIO_ROOT_USER || "minioadmin",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const DEFAULT_BUCKET = "aicare-documents";

/**
 * PNOS F2.9 — whether a NEWLY created documents bucket gets a public-read
 * policy. Defaults to TRUE = today's behaviour, because the admin/member/HR
 * pages still render documents from a direct public `fileUrl`; flipping this
 * before those consumers are migrated (remaining F2.8 groups) would break them.
 * Set MINIO_PUBLIC_DOCUMENTS=false for a private-by-default environment once
 * the §11.4 document-privacy migration gate is signed off.
 *
 * NOTE: this only governs bucket CREATION. An existing public bucket keeps its
 * policy until an operator changes it — deliberately, so nothing flips silently.
 */
export function publicDocumentsEnabled(): boolean {
  return process.env.MINIO_PUBLIC_DOCUMENTS !== "false";
}

export async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(DEFAULT_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(DEFAULT_BUCKET, "us-east-1");
      if (publicDocumentsEnabled()) {
        // legacy public-read policy (retained until the privacy gate is passed)
        const bucketPolicy = {
          Version: "2012-10-17",
          Statement: [
            {
              Action: ["s3:GetObject"],
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Resource: [`arn:aws:s3:::${DEFAULT_BUCKET}/*`],
            },
          ],
        };
        await minioClient.setBucketPolicy(DEFAULT_BUCKET, JSON.stringify(bucketPolicy));
      }
      // else: no policy applied — the bucket stays private and documents are
      // served only through authorized, short-lived signed URLs (F2.6).
    }
  } catch (err) {
    console.error("MinIO Bucket Check Failed:", err);
  }
}

export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string, keyPrefix?: string): Promise<string> {
  await ensureBucket();

  const ext = originalName.split(".").pop();
  const base = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  // ELIG-GAP (Phase 6): an optional key prefix namespaces the object by
  // tenant/provider so B2B uploads are isolated per facility, not a shared bucket root.
  const fileName = keyPrefix ? `${keyPrefix.replace(/^\/+|\/+$/g, "")}/${base}` : base;

  await minioClient.putObject(DEFAULT_BUCKET, fileName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });

  // Construct URL. In production, this might be a CDN or public facing proxy url
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const endPointUrl = `${protocol}://${process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : "localhost"}:9000`;
  return `${endPointUrl}/${DEFAULT_BUCKET}/${fileName}`;
}
