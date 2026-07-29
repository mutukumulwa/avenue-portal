import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderEntitlementService } from "./provider-entitlement.service";

/**
 * PNOS F1.10 — entitlement shadow comparison.
 *
 * Runs the TARGET entitlement (ProviderEntitlementService) alongside today's
 * permissive lookup and records the divergence, WITHOUT changing the live
 * response and WITHOUT ever letting a shadow failure fail the caller. The
 * recorded samples (safe identifiers only, no PHI) are the evidence
 * network-ops reviews before F1.11 flips deny-by-default per client/provider.
 * Enforcement stays OFF here (spec F1.10 stop condition).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ShadowClassification =
  | "AGREE_ALLOW" //                current allows, target allows
  | "AGREE_DENY" //                 current denies, target denies
  | "TARGET_DENY_CURRENT_ALLOW" //  over-exposure today; the gate will close this
  | "TARGET_ALLOW_CURRENT_DENY" //  gate would wrongly deny — must be repaired first
  | "ERROR"; //                     shadow evaluation failed (never affects live)

/** Pure classifier — deterministic for a given (current, target, error) triple. */
export function classifyShadow(currentAllowed: boolean, targetAllowed: boolean, errored: boolean): ShadowClassification {
  if (errored) return "ERROR";
  if (currentAllowed && targetAllowed) return "AGREE_ALLOW";
  if (!currentAllowed && !targetAllowed) return "AGREE_DENY";
  if (currentAllowed && !targetAllowed) return "TARGET_DENY_CURRENT_ALLOW";
  return "TARGET_ALLOW_CURRENT_DENY";
}

export interface ShadowInput {
  tenantId: string;
  providerId: string;
  memberId: string;
  providerBranchId?: string | null;
  serviceDate?: Date;
  requestId?: string;
  /** persist a sample row (default true). Set false to classify without recording. */
  record?: boolean;
}

export const ProviderEntitlementShadowService = {
  classify: classifyShadow,

  /**
   * Compare current-permissive (tenant-only member visibility, today's browser
   * behavior) against target entitlement for one member lookup. NEVER throws to
   * the caller — any failure is captured as ERROR. Returns the classification;
   * the live response must be computed independently and left unchanged.
   */
  async shadowCompareMemberLookup(input: ShadowInput, db: Db = prisma): Promise<ShadowClassification> {
    const serviceDate = input.serviceDate ?? new Date();
    let classification: ShadowClassification;
    let clientId: string | null = null;
    let currentAllowed = false;
    let targetAllowed = false;
    let errored = false;

    try {
      // current permissive result = member reachable by tenant alone (today).
      const current = await db.member.findFirst({
        where: { id: input.memberId, tenantId: input.tenantId },
        select: { group: { select: { clientId: true } } },
      });
      currentAllowed = !!current;
      clientId = current?.group?.clientId ?? null;

      // target result = member reachable under the provider's effective entitlement.
      const where = await ProviderEntitlementService.entitledMemberWhere(input.providerId, serviceDate);
      const target = await db.member.findFirst({
        where: { id: input.memberId, tenantId: input.tenantId, ...where },
        select: { id: true },
      });
      targetAllowed = !!target;
      classification = classifyShadow(currentAllowed, targetAllowed, false);
    } catch {
      errored = true;
      classification = "ERROR";
    }

    if (input.record !== false) {
      // recording itself must never fail the live path either
      await db.providerEntitlementShadowSample.create({
        data: {
          tenantId: input.tenantId, providerId: input.providerId, clientId,
          providerBranchId: input.providerBranchId ?? null, serviceDate,
          classification, currentAllowed, targetAllowed, errored, requestId: input.requestId ?? null,
        },
      }).catch(() => {});
    }
    return classification;
  },

  /** Safe aggregate metrics by classification (+ optional provider/client filter). */
  async metrics(opts: { tenantId?: string; providerId?: string } = {}, db: Db = prisma) {
    const grouped = await db.providerEntitlementShadowSample.groupBy({
      by: ["classification"],
      where: { ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), ...(opts.providerId ? { providerId: opts.providerId } : {}) },
      _count: { _all: true },
    });
    return grouped.reduce((acc, g) => { acc[g.classification as ShadowClassification] = g._count._all; return acc; }, {} as Record<string, number>);
  },
} as const;
