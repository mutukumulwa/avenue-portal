import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function writeAudit({
  userId,
  action,
  module,
  description,
  metadata,
}: {
  userId: string;
  action: string;
  module: string;
  description: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const hdrs = await headers();
  const ipAddress =
    hdrs.get("x-forwarded-for")?.split(",")[0].trim() ??
    hdrs.get("x-real-ip") ??
    undefined;

  await prisma.auditLog.create({
    data: { userId, action, module, description, ipAddress, metadata },
  });
}
