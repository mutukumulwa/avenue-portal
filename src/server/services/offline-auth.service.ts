import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";

// ─── OFFLINE WORK AUTHORIZATION (WP-B2, TPA_FEEDBACK_WORKPLAN.md §B) ─────────
// A facility that cannot reach the system calls the claims agent; the agent
// issues a short, time-boxed code over the phone (and/or SMS — off-system by
// design). The code unlocks offline capture for that facility and every synced
// operation is traceable back to it.

// Unambiguous alphabet for phone read-out: no 0/O, 1/I/L, 5/S, 8/B.
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ234679";
const DEFAULT_VALIDITY_HOURS = 48;

function generateCode(): string {
  const bytes = randomBytes(6);
  let body = "";
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `OWA-${body}`;
}

export type VerifyResult =
  | { ok: true; auth: { id: string; providerId: string; tenantId: string; validUntil: Date; maxOperations: number | null } }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "REVOKED" | "EXHAUSTED" | "NOT_YET_VALID" | "WRONG_FACILITY" };

export class OfflineAuthService {
  /**
   * Issue a new offline work code for a facility. The code is unique per
   * tenant; collisions retry. Any still-ACTIVE code for the same facility is
   * superseded (revoked) so exactly one code is live per facility at a time.
   */
  static async issueCode(input: {
    tenantId: string;
    providerId: string;
    branchId?: string | null;
    issuedById: string;
    reason?: string;
    contactName?: string;
    contactPhone?: string;
    validityHours?: number;
    maxOperations?: number | null;
  }) {
    const provider = await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { id: true, tenantId: true, name: true },
    });
    if (!provider || provider.tenantId !== input.tenantId) {
      throw new Error("Facility not found");
    }

    // Supersede any live code for this facility — one active code at a time.
    await prisma.offlineWorkAuthorization.updateMany({
      where: { tenantId: input.tenantId, providerId: input.providerId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: input.issuedById },
    });

    const validUntil = new Date(
      Date.now() + (input.validityHours ?? DEFAULT_VALIDITY_HOURS) * 3_600_000,
    );

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.offlineWorkAuthorization.create({
          data: {
            tenantId: input.tenantId,
            providerId: input.providerId,
            branchId: input.branchId ?? null,
            code: generateCode(),
            issuedById: input.issuedById,
            reason: input.reason ?? null,
            contactName: input.contactName ?? null,
            contactPhone: input.contactPhone ?? null,
            validUntil,
            maxOperations: input.maxOperations ?? null,
          },
          include: { provider: { select: { name: true } } },
        });
      } catch (e) {
        // Unique collision on [tenantId, code] — regenerate and retry.
        if (attempt === 4) throw e;
      }
    }
    throw new Error("Could not generate a unique code");
  }

  /**
   * Verify a code for use (pack download, capture unlock, sync ingest).
   * Expiry is enforced here — a lapsed ACTIVE row is flipped to EXPIRED on
   * first touch. `providerId`, when given, must match the code's facility.
   */
  static async verifyCode(tenantId: string, code: string, providerId?: string): Promise<VerifyResult> {
    const auth = await prisma.offlineWorkAuthorization.findUnique({
      where: { tenantId_code: { tenantId, code: code.trim().toUpperCase() } },
    });
    if (!auth) return { ok: false, reason: "NOT_FOUND" };
    if (auth.status === "REVOKED") return { ok: false, reason: "REVOKED" };
    if (auth.status === "EXHAUSTED") return { ok: false, reason: "EXHAUSTED" };
    if (auth.validFrom > new Date()) return { ok: false, reason: "NOT_YET_VALID" };
    if (auth.validUntil < new Date() || auth.status === "EXPIRED") {
      if (auth.status === "ACTIVE") {
        await prisma.offlineWorkAuthorization.update({
          where: { id: auth.id },
          data: { status: "EXPIRED" },
        });
      }
      return { ok: false, reason: "EXPIRED" };
    }
    if (providerId && auth.providerId !== providerId) {
      return { ok: false, reason: "WRONG_FACILITY" };
    }
    if (auth.maxOperations != null) {
      const used = await prisma.syncOperation.count({ where: { offlineAuthId: auth.id } });
      if (used >= auth.maxOperations) {
        await prisma.offlineWorkAuthorization.update({
          where: { id: auth.id },
          data: { status: "EXHAUSTED" },
        });
        return { ok: false, reason: "EXHAUSTED" };
      }
    }
    return {
      ok: true,
      auth: {
        id: auth.id,
        providerId: auth.providerId,
        tenantId: auth.tenantId,
        validUntil: auth.validUntil,
        maxOperations: auth.maxOperations,
      },
    };
  }

  static async revokeCode(tenantId: string, id: string, revokedById: string) {
    const auth = await prisma.offlineWorkAuthorization.findUnique({ where: { id } });
    if (!auth || auth.tenantId !== tenantId) throw new Error("Code not found");
    if (auth.status !== "ACTIVE") throw new Error(`Code is already ${auth.status}`);
    return prisma.offlineWorkAuthorization.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById },
    });
  }

  /** Active + recent codes for the register (newest first). */
  static async listForTenant(tenantId: string, take = 100) {
    return prisma.offlineWorkAuthorization.findMany({
      where: { tenantId },
      include: {
        provider: { select: { name: true } },
        issuedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { syncOperations: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /** Sweep lapsed ACTIVE codes to EXPIRED (WP-B4 daily job piggyback). */
  static async expireLapsed(tenantId?: string) {
    const res = await prisma.offlineWorkAuthorization.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: "ACTIVE",
        validUntil: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    return res.count;
  }
}
