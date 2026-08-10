import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProviderAccessContext } from "./provider-access.service";
import { ProviderEntitlementService } from "./provider-entitlement.service";
import { ProviderEntitlementShadowService } from "./provider-entitlement-shadow.service";
import { ProviderAccessSettingsService } from "./provider-access-settings.service";

/**
 * PNOS F1.11 — canonical provider eligibility check.
 *
 * Resolves a member eligibility lookup from the F1.3 access context, records a
 * point-in-time evidence row (ProviderEligibilityCheck), and returns a MINIMUM
 * safe response — no tenant-wide annual limit / utilization history (D2/§8.1),
 * never a payment guarantee.
 *
 * Deny-by-default entitlement (D3) is behind ProviderAccessSettings and OFF by
 * default: when OFF the member resolves permissively (today's behavior) and a
 * shadow sample is recorded (F1.10); when ON (per tenant/provider, after the
 * readiness sign-off) resolution is entitlement-scoped AND the branch must be in
 * the caller's access context. Flipping the flag is the human gate — this
 * package does not flip it.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type EligibilityResultCode =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "NEEDS_PREAUTH"
  | "OUT_OF_NETWORK"
  | "DATA_INCOMPLETE"
  | "MANUAL_CONFIRMATION";

export interface EligibilityCheckInput {
  ctx: ProviderAccessContext;
  memberNumber: string;
  providerBranchId?: string | null;
  serviceDate?: Date;
  benefitCategory?: string | null;
}

export interface EligibilitySafeResult {
  found: boolean;
  resultCode: EligibilityResultCode;
  /** internal member id — present only when found + in scope; used for the same-origin claim-prefill link (not PHI) */
  memberId?: string;
  /** minimal member identity confirmation — only when found + in scope */
  member?: { firstName: string; lastName: string; memberNumber: string };
  schemeName?: string | null;
  packageName?: string | null;
  requiresPreauth?: boolean;
  safeExplanation: string;
  serviceDate: string;
  displayValidUntil: string;
  enforcementApplied: boolean;
  checkId: string;
  /** ALWAYS present — eligibility is never a promise of payment (§8.1). */
  disclaimer: string;
}

const DISCLAIMER =
  "This is a point-in-time eligibility check, not a guarantee of payment. Final payment depends on the actual service, a complete claim, the contract, any pre-authorisation, benefit limits, and policy.";

export const ProviderEligibilityService = {
  async check(input: EligibilityCheckInput, db: Db = prisma): Promise<EligibilitySafeResult> {
    const { ctx } = input;
    const serviceDate = input.serviceDate ?? new Date();
    const requestId = ctx.requestId ?? randomUUID();
    const enforced = await ProviderAccessSettingsService.isEntitlementEnforced(ctx.tenantId, ctx.providerId, db);

    // helper to persist safe evidence + return
    const finish = async (
      resultCode: EligibilityResultCode,
      safeExplanation: string,
      member?: { id: string; firstName: string; lastName: string; memberNumber: string; clientId: string | null; groupId: string | null; packageId: string | null; requiresPreauth?: boolean; schemeName?: string | null; packageName?: string | null },
    ): Promise<EligibilitySafeResult> => {
      const displayValidUntil = new Date(serviceDate.getTime() + 24 * 60 * 60 * 1000);
      const check = await db.providerEligibilityCheck.create({
        data: {
          tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: input.providerBranchId ?? null,
          actorType: ctx.actorType, actorId: ctx.actorId, credentialId: ctx.credentialId ?? null,
          memberId: member?.id ?? null, clientId: member?.clientId ?? null, groupId: member?.groupId ?? null, packageId: member?.packageId ?? null,
          requestedServiceDate: serviceDate, benefitCategory: input.benefitCategory ?? null,
          resultCode, safeExplanation, enforcementApplied: enforced, requestId, displayValidUntil,
        },
        select: { id: true },
      });
      return {
        found: !!member, resultCode, safeExplanation, serviceDate: serviceDate.toISOString(), displayValidUntil: displayValidUntil.toISOString(),
        enforcementApplied: enforced, checkId: check.id, disclaimer: DISCLAIMER,
        ...(member ? { memberId: member.id, member: { firstName: member.firstName, lastName: member.lastName, memberNumber: member.memberNumber }, schemeName: member.schemeName ?? null, packageName: member.packageName ?? null, requiresPreauth: member.requiresPreauth ?? false } : {}),
      };
    };

    // ENFORCED path: branch must be in the caller's context; member must be entitled.
    if (enforced) {
      if (input.providerBranchId && !ctx.allowedProviderBranchIds.includes(input.providerBranchId)) {
        return finish("OUT_OF_NETWORK", "This facility branch is not authorised for this lookup.");
      }
      const where = await ProviderEntitlementService.entitledMemberWhere(ctx.providerId, serviceDate);
      const m = await db.member.findFirst({
        where: { memberNumber: { equals: input.memberNumber, mode: "insensitive" }, tenantId: ctx.tenantId, ...where },
        select: { id: true, firstName: true, lastName: true, memberNumber: true, status: true, group: { select: { name: true, status: true, clientId: true } }, groupId: true, package: { select: { name: true } }, packageId: true },
      });
      // Safe not-found: an out-of-scope member is indistinguishable from an absent one (§9.1).
      if (!m) return finish("NOT_ELIGIBLE", "No eligible member found for this facility.");
      const active = m.status === "ACTIVE" && m.group?.status === "ACTIVE";
      return finish(active ? "ELIGIBLE" : "NOT_ELIGIBLE", active ? "Member cover is active for this facility." : "Member cover is not currently active.", {
        id: m.id, firstName: m.firstName, lastName: m.lastName, memberNumber: m.memberNumber, clientId: m.group?.clientId ?? null, groupId: m.groupId, packageId: m.packageId, schemeName: m.group?.name ?? null, packageName: m.package?.name ?? null,
      });
    }

    // NOT-ENFORCED (default): member resolution is STILL entitlement-scoped even
    // with deny-by-default enforcement OFF (PRIVACY-S1-A). A provider must never
    // be able to resolve — or even confirm the existence of — a member outside
    // the clients/groups its active contracts cover; a tenant-only lookup here
    // was a card-number enumeration + name-disclosure oracle. The enforcement
    // flag governs the branch-in-context gate and shadow sampling, never whether
    // member PII crosses the entitlement boundary. An out-of-entitlement number
    // is indistinguishable from an absent one (same "No member found" message),
    // mirroring the enforced path's non-enumerating not-found.
    const where = await ProviderEntitlementService.entitledMemberWhere(ctx.providerId, serviceDate);
    const m = await db.member.findFirst({
      where: { memberNumber: { equals: input.memberNumber, mode: "insensitive" }, tenantId: ctx.tenantId, ...where },
      select: { id: true, firstName: true, lastName: true, memberNumber: true, status: true, group: { select: { name: true, status: true, clientId: true } }, groupId: true, package: { select: { name: true } }, packageId: true },
    });
    if (m) {
      // fire-and-forget shadow (never throws, never blocks)
      await ProviderEntitlementShadowService.shadowCompareMemberLookup(
        { tenantId: ctx.tenantId, providerId: ctx.providerId, memberId: m.id, providerBranchId: input.providerBranchId, serviceDate, requestId },
        db,
      ).catch(() => {});
    }
    if (!m) return finish("NOT_ELIGIBLE", "No member found for that number.");
    const active = m.status === "ACTIVE" && m.group?.status === "ACTIVE";
    return finish(active ? "ELIGIBLE" : "NOT_ELIGIBLE", active ? "Member cover is active." : "Member cover is not currently active.", {
      id: m.id, firstName: m.firstName, lastName: m.lastName, memberNumber: m.memberNumber, clientId: m.group?.clientId ?? null, groupId: m.groupId, packageId: m.packageId, schemeName: m.group?.name ?? null, packageName: m.package?.name ?? null,
    });
  },
} as const;
