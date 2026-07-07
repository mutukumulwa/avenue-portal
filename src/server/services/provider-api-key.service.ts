import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

/**
 * Per-facility API credentials for HMS / hospital-system integration.
 * A facility with a hospital management system posts to /api/v1/* using its own
 * key; the key resolves to exactly one Provider so every submission is
 * attributed to (and confined to) that facility. Only a bcrypt hash is stored;
 * the plaintext is returned once at generation and never again.
 */
export class ProviderApiKeyService {
  private static PREFIX = "mvxk_";

  static async list(tenantId: string, providerId: string) {
    return prisma.providerApiKey.findMany({
      where: { tenantId, providerId },
      select: { id: true, label: true, keyPrefix: true, isActive: true, lastUsedAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Generate a new key. Returns the plaintext exactly once. */
  static async generate(tenantId: string, providerId: string, label: string, createdById?: string) {
    const secret = randomBytes(24).toString("hex"); // 48 hex chars
    const plaintext = `${this.PREFIX}${secret}`;
    const keyPrefix = plaintext.slice(0, 12);
    const keyHash = await bcrypt.hash(plaintext, 10);

    const row = await prisma.providerApiKey.create({
      data: { tenantId, providerId, label: label.trim() || "API key", keyPrefix, keyHash, createdById },
      select: { id: true, label: true, keyPrefix: true, createdAt: true },
    });
    return { ...row, plaintext };
  }

  static async revoke(tenantId: string, providerId: string, id: string) {
    const key = await prisma.providerApiKey.findFirst({ where: { id, tenantId, providerId } });
    if (!key) throw new Error("API key not found.");
    return prisma.providerApiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  /**
   * Resolve a presented plaintext key to its provider context. Returns null when
   * it doesn't match an active key. Updates lastUsedAt on a hit.
   */
  static async verify(plaintext: string): Promise<{ tenantId: string; providerId: string; keyId: string } | null> {
    if (!plaintext || !plaintext.startsWith(this.PREFIX)) return null;
    const keyPrefix = plaintext.slice(0, 12);
    const candidates = await prisma.providerApiKey.findMany({
      where: { keyPrefix, isActive: true },
      select: { id: true, tenantId: true, providerId: true, keyHash: true },
    });
    for (const c of candidates) {
      if (await bcrypt.compare(plaintext, c.keyHash)) {
        await prisma.providerApiKey.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        return { tenantId: c.tenantId, providerId: c.providerId, keyId: c.id };
      }
    }
    return null;
  }
}
