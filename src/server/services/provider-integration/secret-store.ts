import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

/**
 * PNOS F9.3 — secret-reference store for integration connections.
 *
 * A connection's credential material NEVER lives on the connection row; it lives
 * here as a bcrypt hash (mirrors ProviderApiKeyService). The plaintext is revealed
 * exactly ONCE at mint/rotate and never again. Rotation retires the prior version
 * and mints the next (version+1). Verification compares against the ACTIVE secret.
 *
 * Scope: the locally-generated signing secret (inbound). Reversible storage for an
 * OUTBOUND partner-supplied credential (which must be replayed to the partner) is
 * deferred to F9.7, when the contracted auth scheme is known — this store must not
 * guess an encryption scheme speculatively.
 */

type Db = PrismaClient | Prisma.TransactionClient;

const SECRET_PREFIX = "mvxi_"; // Medvex integration secret

export interface MintedSecret {
  secretId: string;
  version: number;
  /** The plaintext — returned exactly once. Callers must surface it and discard it. */
  plaintext: string;
}

export const IntegrationSecretStore = {
  /**
   * Mint (or rotate to) the connection's next secret version. Retires any current
   * ACTIVE secret first, so exactly one ACTIVE secret exists per connection. Returns
   * the plaintext once. Runs inside the caller's tx when one is supplied.
   */
  async mint(db: Db, args: { tenantId: string; connectionId: string; createdById?: string }): Promise<MintedSecret> {
    const plaintext = `${SECRET_PREFIX}${randomBytes(24).toString("hex")}`;
    const secretHash = await bcrypt.hash(plaintext, 10);

    const latest = await db.providerIntegrationSecret.findFirst({
      where: { connectionId: args.connectionId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    // Retire the current ACTIVE secret (overlap is not modelled — rotation revokes
    // the predecessor; this is the "revoke" the F9.3 test asserts).
    await db.providerIntegrationSecret.updateMany({
      where: { connectionId: args.connectionId, status: "ACTIVE" },
      data: { status: "RETIRED", retiredAt: new Date() },
    });

    const row = await db.providerIntegrationSecret.create({
      data: {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        version,
        secretHash,
        status: "ACTIVE",
        createdById: args.createdById ?? null,
      },
      select: { id: true, version: true },
    });

    return { secretId: row.id, version: row.version, plaintext };
  },

  /** True when a connection currently has an ACTIVE secret (a read-safe fact — no material). */
  async hasActiveSecret(db: Db, connectionId: string): Promise<boolean> {
    const active = await db.providerIntegrationSecret.findFirst({
      where: { connectionId, status: "ACTIVE" },
      select: { id: true },
    });
    return !!active;
  },

  /**
   * Verify a presented secret against the connection's ACTIVE secret. Returns false
   * for a retired/absent secret. Never logs or returns the material.
   */
  async verify(db: Db, connectionId: string, presented: string): Promise<boolean> {
    if (!presented || !presented.startsWith(SECRET_PREFIX)) return false;
    const active = await db.providerIntegrationSecret.findFirst({
      where: { connectionId, status: "ACTIVE" },
      select: { secretHash: true },
    });
    if (!active) return false;
    return bcrypt.compare(presented, active.secretHash);
  },
} as const;

export const _INTEGRATION_SECRET_PREFIX = SECRET_PREFIX;

// Bind the default prisma client for callers that don't thread a tx.
export const IntegrationSecretStoreDefault = {
  mint: (args: { tenantId: string; connectionId: string; createdById?: string }) => IntegrationSecretStore.mint(prisma, args),
  hasActiveSecret: (connectionId: string) => IntegrationSecretStore.hasActiveSecret(prisma, connectionId),
  verify: (connectionId: string, presented: string) => IntegrationSecretStore.verify(prisma, connectionId, presented),
};
