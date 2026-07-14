import { prisma } from "@/lib/prisma";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// ─── FACILITY OFFLINE DATA PACK (WP-B3, TPA_FEEDBACK_WORKPLAN.md §B / D3) ────
// The MINIMUM data a facility needs to run its day offline (TPA-confirmed):
//   roster    — memberNumber, name, active status. No contact details, no
//               clinical history.
//   balances  — remaining benefit per member per category.
//   tariffs   — the facility's active contracted rates.
//
// Packs are stored and served ONLY as an AES-256-GCM envelope. The data key is
// HKDF-derived from the offline work CODE (which travels by phone/SMS — never
// with the pack) + a random per-pack salt, so a stolen pack file alone is
// useless. The capture client re-derives the key in the browser (WebCrypto)
// from the code the operator types.
//
// Envelope framing (keyVersion 1): ciphertext column = salt(16) ‖ gcmCiphertext.

const HKDF_INFO = "medvex-offline-pack-v1";
const SALT_LEN = 16;
const IV_LEN = 12;
const PACK_VALIDITY_HOURS = 24;

export interface OfflinePackPayload {
  packVersion: 1;
  providerId: string;
  generatedAt: string;
  validUntil: string;
  roster: { memberNumber: string; firstName: string; lastName: string; status: string }[];
  balances: { memberNumber: string; category: string; limit: number; remaining: number }[];
  tariffs: { code: string | null; name: string; rate: number; currency: string; requiresPreauth: boolean }[];
}

function deriveKey(code: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(code.trim().toUpperCase(), "utf8"), salt, HKDF_INFO, 32));
}

export function encryptPack(code: string, payload: OfflinePackPayload) {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(code, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: Buffer.concat([salt, encrypted]),
    iv,
    authTag: cipher.getAuthTag(),
    sizeBytes: plaintext.length,
  };
}

export function decryptPack(code: string, ciphertext: Buffer, iv: Buffer, authTag: Buffer): OfflinePackPayload {
  const salt = ciphertext.subarray(0, SALT_LEN);
  const body = ciphertext.subarray(SALT_LEN);
  const key = deriveKey(code, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as OfflinePackPayload;
}

export class OfflinePackService {
  /**
   * Build the minimised payload for a facility: active members eligible at the
   * provider (package INCLUDE/EXCLUDE rules honoured), their remaining benefit
   * per category, and the provider's active tariff excerpt.
   */
  static async buildPayload(tenantId: string, providerId: string): Promise<OfflinePackPayload> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, tenantId: true, tier: true },
    });
    if (!provider || provider.tenantId !== tenantId) throw new Error("Facility not found");

    // FG-C1: the pack must contain only members this facility is entitled to
    // (its contracted clients/groups) — NOT the whole tenant. Reuse the same
    // entitlement fragment the B2B eligibility API uses (deny-by-default; also
    // honours WP-A6 group-level applicability once applied).
    const { ProviderEntitlementService } = await import("./provider-entitlement.service");
    const entitledWhere = await ProviderEntitlementService.entitledMemberWhere(providerId);
    const members = await prisma.member.findMany({
      where: { AND: [{ tenantId, status: "ACTIVE" }, entitledWhere] },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true, status: true,
        packageVersionId: true,
      },
    });

    // Package-level provider eligibility (same gate createClaim applies).
    const versionIds = [...new Set(members.map((m) => m.packageVersionId).filter((v): v is string => !!v))];
    const rules = await prisma.packageProviderEligibility.findMany({
      where: { packageVersionId: { in: versionIds } },
    });
    const rulesByVersion = new Map<string, typeof rules>();
    for (const r of rules) {
      const list = rulesByVersion.get(r.packageVersionId) ?? [];
      list.push(r);
      rulesByVersion.set(r.packageVersionId, list);
    }
    const eligible = members.filter((m) => {
      const vr = m.packageVersionId ? rulesByVersion.get(m.packageVersionId) : undefined;
      if (!vr || vr.length === 0) return true;
      const matches = (r: (typeof rules)[number]) =>
        r.providerId === providerId || (r.providerTier !== null && r.providerTier === provider.tier);
      if (vr.some((r) => r.inclusionType === "EXCLUDE" && matches(r))) return false;
      const includes = vr.filter((r) => r.inclusionType === "INCLUDE");
      return includes.length === 0 || includes.some(matches);
    });

    // Balances: per member, per benefit category on their package version.
    const memberIds = eligible.map((m) => m.id);
    const usages = await prisma.benefitUsage.findMany({
      where: { memberId: { in: memberIds }, periodStart: { lte: new Date() }, periodEnd: { gte: new Date() } },
      select: {
        memberId: true, amountUsed: true, activeHoldAmount: true,
        benefitConfig: { select: { category: true, annualSubLimit: true } },
      },
    });
    const numberById = new Map(eligible.map((m) => [m.id, m.memberNumber]));
    const balances = usages.map((u) => {
      const limit = Number(u.benefitConfig.annualSubLimit);
      return {
        memberNumber: numberById.get(u.memberId) ?? "",
        category: u.benefitConfig.category,
        limit,
        remaining: Math.max(0, limit - Number(u.amountUsed) - Number(u.activeHoldAmount)),
      };
    });

    // Tariff excerpt: the facility's active contracted rates.
    const tariffs = await prisma.providerTariff.findMany({
      where: { providerId, isActive: true, clientId: null },
      select: {
        cptCode: true, providerServiceCode: true, serviceName: true,
        agreedRate: true, currency: true, requiresPreauth: true,
      },
      orderBy: { serviceName: "asc" },
    });

    const now = new Date();
    return {
      packVersion: 1,
      providerId,
      generatedAt: now.toISOString(),
      validUntil: new Date(now.getTime() + PACK_VALIDITY_HOURS * 3_600_000).toISOString(),
      roster: eligible.map((m) => ({
        memberNumber: m.memberNumber,
        firstName: m.firstName,
        lastName: m.lastName,
        status: m.status,
      })),
      balances,
      tariffs: tariffs.map((t) => ({
        code: t.providerServiceCode ?? t.cptCode,
        name: t.serviceName,
        rate: Number(t.agreedRate),
        currency: t.currency,
        requiresPreauth: t.requiresPreauth,
      })),
    };
  }

  /**
   * Generate (or regenerate) the encrypted pack for an ACTIVE work
   * authorization and pin it on the auth row. Also refreshes per-member
   * EligibilitySnapshot rows for audit/debug of what the facility was told.
   */
  static async generateForAuthorization(authId: string) {
    const auth = await prisma.offlineWorkAuthorization.findUnique({
      where: { id: authId },
      select: { id: true, tenantId: true, providerId: true, code: true, status: true },
    });
    if (!auth) throw new Error("Authorization not found");
    if (auth.status !== "ACTIVE") throw new Error(`Authorization is ${auth.status}`);

    const payload = await OfflinePackService.buildPayload(auth.tenantId, auth.providerId);
    const { ciphertext, iv, authTag, sizeBytes } = encryptPack(auth.code, payload);

    const pack = await prisma.offlineDataPack.create({
      data: {
        tenantId: auth.tenantId,
        providerId: auth.providerId,
        validUntil: new Date(payload.validUntil),
        memberCount: payload.roster.length,
        ciphertext, iv, authTag,
        keyVersion: 1,
        sizeBytes,
      },
    });
    await prisma.offlineWorkAuthorization.update({
      where: { id: auth.id },
      data: { packId: pack.id },
    });

    // Snapshot what each member's balance looked like when shared (audit).
    const byMember = new Map<string, { category: string; limit: number; remaining: number }[]>();
    for (const b of payload.balances) {
      const list = byMember.get(b.memberNumber) ?? [];
      list.push({ category: b.category, limit: b.limit, remaining: b.remaining });
      byMember.set(b.memberNumber, list);
    }
    const rosterMembers = await prisma.member.findMany({
      where: { tenantId: auth.tenantId, memberNumber: { in: payload.roster.map((r) => r.memberNumber) } },
      select: { id: true, memberNumber: true },
    });
    await prisma.eligibilitySnapshot.createMany({
      data: rosterMembers.map((m) => ({
        tenantId: auth.tenantId,
        memberId: m.id,
        active: true,
        balances: byMember.get(m.memberNumber) ?? [],
        tariffRef: pack.id,
        validUntil: new Date(payload.validUntil),
      })),
    });

    return pack;
  }

  /**
   * Code-gated download (WP-B3): returns the encrypted envelope for transport.
   * The caller decrypts client-side with the code — the plaintext never
   * travels with the file.
   */
  static async getEncryptedPack(tenantId: string, code: string) {
    const { OfflineAuthService } = await import("./offline-auth.service");
    const verdict = await OfflineAuthService.verifyCode(tenantId, code);
    if (!verdict.ok) throw new Error(`Offline code rejected: ${verdict.reason}`);

    const auth = await prisma.offlineWorkAuthorization.findUnique({
      where: { id: verdict.auth.id },
      select: { packId: true },
    });
    let packId = auth?.packId;
    if (!packId) {
      packId = (await OfflinePackService.generateForAuthorization(verdict.auth.id)).id;
    }
    const pack = await prisma.offlineDataPack.findUnique({ where: { id: packId } });
    if (!pack) throw new Error("Pack not found");
    if (pack.validUntil < new Date()) {
      const fresh = await OfflinePackService.generateForAuthorization(verdict.auth.id);
      return OfflinePackService.serialise(fresh);
    }
    return OfflinePackService.serialise(pack);
  }

  private static serialise(pack: {
    id: string; generatedAt: Date; validUntil: Date; memberCount: number;
    ciphertext: Uint8Array; iv: Uint8Array; authTag: Uint8Array; keyVersion: number;
  }) {
    return {
      packId: pack.id,
      generatedAt: pack.generatedAt.toISOString(),
      validUntil: pack.validUntil.toISOString(),
      memberCount: pack.memberCount,
      keyVersion: pack.keyVersion,
      ciphertext: Buffer.from(pack.ciphertext).toString("base64"),
      iv: Buffer.from(pack.iv).toString("base64"),
      authTag: Buffer.from(pack.authTag).toString("base64"),
    };
  }

  /** Daily regeneration for every facility holding an ACTIVE code (WP-B3 job). */
  static async regenerateActivePacks() {
    const active = await prisma.offlineWorkAuthorization.findMany({
      where: { status: "ACTIVE", validUntil: { gte: new Date() } },
      select: { id: true },
    });
    let ok = 0;
    for (const a of active) {
      try {
        await OfflinePackService.generateForAuthorization(a.id);
        ok++;
      } catch (e) {
        console.error(`[offline-pack] regeneration failed for auth ${a.id}:`, e);
      }
    }
    return { total: active.length, regenerated: ok };
  }
}
