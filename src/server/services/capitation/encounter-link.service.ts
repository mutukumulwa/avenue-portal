import { prisma } from "@/lib/prisma";
import { CapitationError, type CapitationActor } from "./arrangement.service";

/**
 * PNOS F10.5 — link encounters + protect carve-outs.
 *
 * Resolves the capitation arrangement at a service's date/provider/branch and
 * classifies a line as INCLUDED (pool, zero FFS payable, linked for utilization),
 * CARVE_OUT (ordinary canonical FFS), or FFS/NO_ARRANGEMENT. A line links AT MOST
 * ONCE (schema @@unique) — the same service can never be both without an explicit
 * split. `assertFfsSettlementAllowed` hard-denies an included zero-pay line from
 * entering FFS settlement (§D24 / PNO-CAP-004). Utilization is preserved — the link
 * is a separate row and NEVER mutates or deletes the encounter. No provider
 * statement (F10.5 stop). GATED behind F10.1.
 */

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "FINANCE_OFFICER"]);
function requireManager(actor: CapitationActor) {
  if (!MANAGER_ROLES.has(actor.role)) throw new CapitationError("FORBIDDEN", "Capitation management requires a finance role.");
}
function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

export type ServiceFunding = "CAPITATION" | "FEE_FOR_SERVICE";
export type FundingDecision = "INCLUDED" | "CARVE_OUT" | "FFS";

export interface ClassifyResult {
  funding: FundingDecision;
  arrangementId: string | null;
  reason: string;
}

export interface LinkInput {
  arrangementId: string;
  periodId?: string | null;
  memberId: string;
  providerId: string;
  providerBranchId?: string;
  serviceDate: Date;
  entityType: "CLAIM_LINE" | "CASE_SERVICE_ENTRY";
  entityId: string;
  funding: "INCLUDED" | "CARVE_OUT";
  reason?: string;
}

export const CapitationEncounterLinkService = {
  /** The ACTIVE arrangement effective at the service date for the provider (+ branch, most-specific wins). */
  async resolveArrangement(tenantId: string, at: { serviceDate: Date; providerId: string; providerBranchId?: string }) {
    const branch = at.providerBranchId ?? "";
    return prisma.capitationArrangement.findFirst({
      where: {
        tenantId, providerId: at.providerId, status: "ACTIVE",
        effectiveFrom: { lte: at.serviceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at.serviceDate } }],
        providerBranchId: { in: ["", branch] },
      },
      orderBy: { providerBranchId: "desc" }, // a branch-specific arrangement wins over the provider-level ("")
      select: { id: true, rateBasis: true, providerBranchId: true },
    });
  },

  /** Classify a service: INCLUDED (pool), CARVE_OUT (FFS under an arrangement), or FFS (no arrangement). */
  async classify(tenantId: string, at: { serviceDate: Date; providerId: string; providerBranchId?: string; serviceFunding: ServiceFunding }): Promise<ClassifyResult> {
    const arr = await this.resolveArrangement(tenantId, at);
    if (!arr) return { funding: "FFS", arrangementId: null, reason: "NO_ARRANGEMENT" };
    if (at.serviceFunding === "CAPITATION") return { funding: "INCLUDED", arrangementId: arr.id, reason: "POOL_COVERED" };
    return { funding: "CARVE_OUT", arrangementId: arr.id, reason: "EXPLICIT_CARVE_OUT" };
  },

  /**
   * Record the funding decision for a line. @@unique on (entityType, entityId) makes
   * a second link a CONFLICT — a service cannot count as both capitated and FFS
   * without an explicit split (a caller must remove the prior link first).
   */
  async linkEncounter(actor: CapitationActor, input: LinkInput) {
    requireManager(actor);
    try {
      return await prisma.capitationEncounterLink.create({
        data: {
          tenantId: actor.tenantId, arrangementId: input.arrangementId, periodId: input.periodId ?? null,
          memberId: input.memberId, providerId: input.providerId, providerBranchId: input.providerBranchId ?? "",
          serviceDate: input.serviceDate, entityType: input.entityType, entityId: input.entityId, funding: input.funding,
          reason: input.reason ?? null, createdById: actor.userId,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new CapitationError("OVERLAP", "This line already has a funding decision — a service cannot be both capitated and FFS without an explicit split.");
      throw e;
    }
  },

  /**
   * Settlement guard: an INCLUDED (capitated, zero-pay) line must NOT enter FFS
   * settlement. Throws when the line is pool-included; a CARVE_OUT or unlinked line
   * settles normally. (Wiring this into the live FFS settlement path is the gated
   * activation step — the guard is provided + tested here.)
   */
  async assertFfsSettlementAllowed(tenantId: string, entityType: string, entityId: string) {
    const link = await prisma.capitationEncounterLink.findFirst({ where: { tenantId, entityType, entityId }, select: { funding: true } });
    if (link?.funding === "INCLUDED") {
      throw new CapitationError("PERIOD_IMMUTABLE", "This line is capitated (zero FFS payable) — it cannot enter fee-for-service settlement; it is paid via the capitation pool.");
    }
  },
} as const;
