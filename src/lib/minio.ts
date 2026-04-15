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

export async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(DEFAULT_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(DEFAULT_BUCKET, "us-east-1");
      // Set read-only policy for public access to files if needed, or keep private
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
  } catch (err) {
    console.error("MinIO Bucket Check Failed:", err);
  }
}

export async function uploadFile(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
  await ensureBucket();
  
  const ext = originalName.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  await minioClient.putObject(DEFAULT_BUCKET, fileName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });

  // Construct URL. In production, this might be a CDN or public facing proxy url
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const endPointUrl = `${protocol}://${process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : "localhost"}:9000`;
  return `${endPointUrl}/${DEFAULT_BUCKET}/${fileName}`;
}
