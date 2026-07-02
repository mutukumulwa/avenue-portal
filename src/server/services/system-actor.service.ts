import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Per-tenant system service account for unattended writes (offline-sync
 * reconciliation, scheduled jobs) that must satisfy the AuditLog.userId → User
 * FK. The account is deactivated (cannot log in) and carries an unusable
 * password hash. Resolved lazily and cached per process.
 */
const SYSTEM_EMAIL = "system@medvex.internal";
const cache = new Map<string, string>();

export async function getSystemActorId(tenantId: string): Promise<string> {
  const hit = cache.get(tenantId);
  if (hit) return hit;

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: SYSTEM_EMAIL } },
    update: {},
    create: {
      tenantId,
      email: SYSTEM_EMAIL,
      // Random hex — never verifies against bcrypt, so the account is unusable
      passwordHash: crypto.randomBytes(32).toString("hex"),
      firstName: "Medvex",
      lastName: "System",
      role: "CLAIMS_OFFICER",
      isActive: false,
    },
    select: { id: true },
  });
  cache.set(tenantId, user.id);
  return user.id;
}
