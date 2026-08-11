import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { ProvidersService } from "./providers.service";

/**
 * Per-facility API credentials for HMS / hospital-system integration.
 * A facility posts to /api/v1/* using its own key; the key resolves to exactly
 * one Provider so every submission is attributed to (and confined to) that
 * facility. Only a bcrypt hash is stored; the plaintext is returned once at
 * generation and never again.
 *
 * PNOS F1.6 — credentials are now least-privilege and governable: scopes,
 * optional branch restriction, hard expiry, overlap-safe rotation, and
 * actor/reason on revoke. Route→scope enforcement itself lands in F1.7; this
 * service surfaces the scope/branch facts and the pure check helpers.
 */

/** Verified credential facts returned to the auth layer. */
export interface VerifiedProviderKey {
  tenantId: string;
  providerId: string;
  keyId: string;
  scopes: string[];
  allowedBranchIds: string[];
}

export interface GenerateOptions {
  scopes?: string[];
  allowedBranchIds?: string[];
  expiresAt?: Date | null;
  /** Set when rotating — the new key joins the predecessor's family. */
  rotationFamilyId?: string;
  previousKeyId?: string;
}

export class ProviderApiKeyService {
  private static PREFIX = "mvxk_";

  static async list(tenantId: string, providerId: string) {
    return prisma.providerApiKey.findMany({
      where: { tenantId, providerId },
      // Safe projection only — never keyHash, never plaintext (§7.2).
      select: {
        id: true, label: true, keyPrefix: true, isActive: true, scopes: true, allowedBranchIds: true,
        expiresAt: true, lastUsedAt: true, lastSuccessAt: true, lastFailureAt: true,
        rotationFamilyId: true, previousKeyId: true, createdAt: true, revokedAt: true, revokeReason: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Generate a new key. Returns the plaintext exactly once. */
  static async generate(tenantId: string, providerId: string, label: string, createdById?: string, opts: GenerateOptions = {}) {
    const secret = randomBytes(24).toString("hex");
    const plaintext = `${this.PREFIX}${secret}`;
    const keyPrefix = plaintext.slice(0, 12);
    const keyHash = await bcrypt.hash(plaintext, 10);
    // A fresh key starts its own rotation family; a rotated key inherits one.
    const rotationFamilyId = opts.rotationFamilyId ?? randomUUID();

    const row = await prisma.providerApiKey.create({
      data: {
        tenantId, providerId, label: label.trim() || "API key", keyPrefix, keyHash, createdById,
        scopes: opts.scopes ?? [], allowedBranchIds: opts.allowedBranchIds ?? [],
        expiresAt: opts.expiresAt ?? null, rotationFamilyId, previousKeyId: opts.previousKeyId ?? null,
      },
      select: { id: true, label: true, keyPrefix: true, scopes: true, allowedBranchIds: true, expiresAt: true, rotationFamilyId: true, createdAt: true },
    });
    return { ...row, plaintext };
  }

  static async revoke(tenantId: string, providerId: string, id: string, opts: { revokedById?: string; reason?: string } = {}) {
    const key = await prisma.providerApiKey.findFirst({ where: { id, tenantId, providerId } });
    if (!key) throw new Error("API key not found.");
    return prisma.providerApiKey.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedById: opts.revokedById ?? null, revokeReason: opts.reason ?? null },
    });
  }

  /**
   * Overlap-safe rotation: mint a successor inheriting scopes/branches/family,
   * and set the predecessor to expire at `overlapUntil` (default now — no
   * overlap) so both keys are briefly valid during a cutover, then only the new
   * one. The predecessor is NOT hard-revoked, so in-flight callers keep working
   * until the cutoff. Returns the new plaintext once.
   */
  static async rotate(tenantId: string, providerId: string, keyId: string, opts: { overlapUntil?: Date; createdById?: string; label?: string } = {}) {
    const prev = await prisma.providerApiKey.findFirst({ where: { id: keyId, tenantId, providerId } });
    if (!prev) throw new Error("API key not found.");
    const overlapUntil = opts.overlapUntil ?? new Date();
    const created = await this.generate(tenantId, providerId, opts.label ?? prev.label, opts.createdById, {
      scopes: prev.scopes, allowedBranchIds: prev.allowedBranchIds,
      expiresAt: prev.expiresAt, rotationFamilyId: prev.rotationFamilyId ?? undefined, previousKeyId: prev.id,
    });
    // predecessor expires at the overlap cutoff (still active, but time-bounded)
    await prisma.providerApiKey.update({ where: { id: prev.id }, data: { expiresAt: overlapUntil } });
    return created;
  }

  /**
   * Resolve a presented plaintext key. Returns null when it does not match an
   * active, unexpired key. Records success/attempt health on a hit.
   */
  static async verify(plaintext: string, now: Date = new Date()): Promise<VerifiedProviderKey | null> {
    if (!plaintext || !plaintext.startsWith(this.PREFIX)) return null;
    const keyPrefix = plaintext.slice(0, 12);
    const candidates = await prisma.providerApiKey.findMany({
      where: { keyPrefix, isActive: true },
      select: {
        id: true, tenantId: true, providerId: true, keyHash: true, scopes: true, allowedBranchIds: true, expiresAt: true,
        // WP-N4 (N-014): the owning facility's status gates authentication.
        provider: { select: { contractStatus: true } },
      },
    });
    for (const c of candidates) {
      if (await bcrypt.compare(plaintext, c.keyHash)) {
        // Expiry is a hard gate — an expired key never authenticates.
        if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) {
          await prisma.providerApiKey.update({ where: { id: c.id }, data: { lastUsedAt: now, lastFailureAt: now } }).catch(() => {});
          return null;
        }
        // WP-N4 (N-014): a suspended/non-operational facility's key stops working —
        // a suspended facility must not keep transacting on the B2B API.
        if (!c.provider || !ProvidersService.isOperational(c.provider.contractStatus)) {
          await prisma.providerApiKey.update({ where: { id: c.id }, data: { lastUsedAt: now, lastFailureAt: now } }).catch(() => {});
          return null;
        }
        await prisma.providerApiKey.update({ where: { id: c.id }, data: { lastUsedAt: now, lastSuccessAt: now } }).catch(() => {});
        return { tenantId: c.tenantId, providerId: c.providerId, keyId: c.id, scopes: c.scopes, allowedBranchIds: c.allowedBranchIds };
      }
    }
    return null;
  }

  // ── pure scope/branch checks (used by F1.7 route enforcement) ──────────────

  /**
   * FAIL-CLOSED (ELIG-GAP-009, Phase 6): the key must explicitly carry the
   * required scope. The previous "empty scopes ⇒ every scope" behaviour is
   * REMOVED — an unscoped key now has NO access. Safe because the key-creation UI
   * (Phase 5) requires at least one scope, so no path mints an empty-scope key.
   */
  static hasScope(cred: { scopes: string[] }, required: string): boolean {
    return (cred.scopes ?? []).includes(required);
  }

  /**
   * FAIL-CLOSED (ELIG-GAP-009, Phase 6): the branch must be explicitly listed.
   * The previous "empty allowedBranchIds ⇒ every branch" behaviour is REMOVED —
   * the key-creation UI now requires at least one branch.
   */
  static allowsBranch(cred: { allowedBranchIds: string[] }, branchId: string): boolean {
    return (cred.allowedBranchIds ?? []).includes(branchId);
  }
}
