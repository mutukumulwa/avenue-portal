import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProviderAccessContext } from "./provider-access.service";
import { ProviderEntitlementService } from "./provider-entitlement.service";
import { ProviderEntitlementShadowService } from "./provider-entitlement-shadow.service";
import { ProviderAccessSettingsService } from "./provider-access-settings.service";
import { ProvidersService } from "./providers.service";
import { decideEligibility } from "./eligibility/evaluator-core";
import {
  ELIGIBILITY_REASON_CATALOGUE,
  memberSafeText,
  operatorGuidanceText,
  verdictForReason,
  type EligibilityDecisionReason,
  type EligibilityDecisionV2,
} from "./eligibility/decision-contract";

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
  /**
   * UAT-HF P03.03 — the canonical decision (P03.02). Added ALONGSIDE the older
   * fields so existing consumers keep working while they migrate; new consumers
   * should branch on `decision.reasonCode`, never on a rendered string.
   */
  decision: EligibilityDecisionV2;
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
      reasonCode: EligibilityDecisionReason,
      member?: { id: string; firstName: string; lastName: string; memberNumber: string; clientId: string | null; groupId: string | null; packageId: string | null; requiresPreauth?: boolean; schemeName?: string | null; packageName?: string | null },
    ): Promise<EligibilitySafeResult> => {
      // One catalogue, one string per audience (P03.02). No surface invents copy.
      const safeExplanation = memberSafeText(reasonCode);
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
      const decision: EligibilityDecisionV2 = {
        verdict: verdictForReason(reasonCode),
        reasonCode,
        memberSafeExplanation: safeExplanation,
        operatorGuidance: operatorGuidanceText(reasonCode),
        serviceDate: serviceDate.toISOString(),
        dataAsOf: new Date().toISOString(),
        validUntil: displayValidUntil.toISOString(),
        packageName: member?.packageName ?? null,
        packageVersionId: null,
        schemeName: member?.schemeName ?? null,
        network: {
          inNetwork: reasonCode !== "OUT_OF_NETWORK" && reasonCode !== "PROVIDER_NOT_ENTITLED",
          networkTier: null,
          providerName: null,
          providerBranchName: null,
        },
        coverStatus: {
          covered: ELIGIBILITY_REASON_CATALOGUE[reasonCode].memberStillCovered && !!member,
          reasonCode,
        },
        benefit: {
          benefitCategory: input.benefitCategory ?? null,
          usable: verdictForReason(reasonCode) === "ELIGIBLE",
          remainingLimit: null,
          currency: null,
          waitingEligibleFrom: null,
          referralRequired: reasonCode === "MISSING_REFERRAL",
          referralOnFile: false,
        },
        correlationId: requestId,
        checkId: check.id,
        disclaimer: DISCLAIMER,
      };
      return {
        found: !!member, resultCode, safeExplanation, decision, serviceDate: serviceDate.toISOString(), displayValidUntil: displayValidUntil.toISOString(),
        enforcementApplied: enforced, checkId: check.id, disclaimer: DISCLAIMER,
        ...(member ? { memberId: member.id, member: { firstName: member.firstName, lastName: member.lastName, memberNumber: member.memberNumber }, schemeName: member.schemeName ?? null, packageName: member.packageName ?? null, requiresPreauth: member.requiresPreauth ?? false } : {}),
      };
    };

    // WP-N4 (N-014): a SUSPENDED (or otherwise non-operational) facility is
    // blocked for new encounters — it must return neither eligibility nor member
    // PII. This runs BEFORE any member lookup, so a suspended facility can never
    // confirm a member exists (mirrors the claim/preauth intake status check and
    // the ProvidersService.ENCOUNTER_STATUSES rule). Evidence is still recorded.
    const facility = await db.provider.findFirst({
      where: { id: ctx.providerId, tenantId: ctx.tenantId },
      select: { contractStatus: true },
    });
    if (!facility || !ProvidersService.isOperational(facility.contractStatus)) {
      return finish("NOT_ELIGIBLE", "PROVIDER_NOT_ENTITLED");
    }

    // ENFORCED path: branch must be in the caller's context; member must be entitled.
    if (enforced) {
      if (input.providerBranchId && !ctx.allowedProviderBranchIds.includes(input.providerBranchId)) {
        return finish("OUT_OF_NETWORK", "OUT_OF_NETWORK");
      }
      const where = await ProviderEntitlementService.entitledMemberWhere(ctx.providerId, serviceDate);
      const m = await db.member.findFirst({
        where: { memberNumber: { equals: input.memberNumber, mode: "insensitive" }, tenantId: ctx.tenantId, ...where },
        select: VERDICT_MEMBER_SELECT,
      });
      // Safe not-found: an out-of-scope member is indistinguishable from an absent one (§9.1).
      if (!m) {
        // DEF-053: a facility entitled to NOBODY returned the same words as a
        // wrong card number, so the desk was told to check a card that was never
        // the problem.
        const entitled = await ProviderEntitlementService.hasEffectiveEntitlement(ctx.providerId, serviceDate);
        return finish("NOT_ELIGIBLE", entitled ? "NOT_FOUND" : "PROVIDER_NOT_ENTITLED");
      }
      // SP-6: the verdict is the single evaluator's member-level decision as of the
      // service date (policy window, pinned version, group/client status, coverage
      // periods, age) — not a bare status===ACTIVE check.
      const verdict = await memberVerdict(db, m, serviceDate);
      return finish(verdict.resultCode, verdict.reasonCode, {
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
      select: VERDICT_MEMBER_SELECT,
    });
    if (m) {
      // fire-and-forget shadow (never throws, never blocks)
      await ProviderEntitlementShadowService.shadowCompareMemberLookup(
        { tenantId: ctx.tenantId, providerId: ctx.providerId, memberId: m.id, providerBranchId: input.providerBranchId, serviceDate, requestId },
        db,
      ).catch(() => {});
    }
    if (!m) {
      const entitled = await ProviderEntitlementService.hasEffectiveEntitlement(ctx.providerId, serviceDate);
      return finish("NOT_ELIGIBLE", entitled ? "NOT_FOUND" : "PROVIDER_NOT_ENTITLED");
    }
    const verdict = await memberVerdict(db, m, serviceDate);
    return finish(verdict.resultCode, verdict.reasonCode, {
      id: m.id, firstName: m.firstName, lastName: m.lastName, memberNumber: m.memberNumber, clientId: m.group?.clientId ?? null, groupId: m.groupId, packageId: m.packageId, schemeName: m.group?.name ?? null, packageName: m.package?.name ?? null,
    });
  },
} as const;

/** The member fields the SP-6 member-level verdict needs. */
const VERDICT_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  memberNumber: true,
  status: true,
  relationship: true,
  dateOfBirth: true,
  enrollmentDate: true,
  coverEndDate: true,
  packageVersionId: true,
  groupId: true,
  packageId: true,
  group: { select: { name: true, status: true, clientId: true, effectiveDate: true, renewalDate: true, client: { select: { status: true } } } },
  package: { select: { name: true, maxAge: true, dependentMaxAge: true } },
} satisfies Prisma.MemberSelect;

type VerdictMember = {
  id: string;
  status: string;
  relationship: string;
  dateOfBirth: Date | null;
  enrollmentDate: Date;
  coverEndDate: Date | null;
  packageVersionId: string | null;
  group: { status: string; effectiveDate: Date | null; renewalDate: Date | null; client: { status: string } | null } | null;
  package: { maxAge: number; dependentMaxAge: number } | null;
};

/**
 * Provider-portal member-level verdict: the SAME `decideEligibility` core every
 * channel uses (never a re-computed status check), projected to the minimum-safe
 * provider view (no balance/usage — §8.1). Benefit-context gates (network,
 * referral, waiting, limit) require the page to pass a benefit category and are a
 * follow-on; the member-life verdict here already honours the policy window,
 * pinned version, group/client status, coverage-as-of-service-date and age.
 */
async function memberVerdict(
  db: Db,
  m: VerdictMember,
  serviceDate: Date,
): Promise<{
  resultCode: EligibilityResultCode;
  reasonCode: EligibilityDecisionReason;
  safeExplanation: string;
  operatorGuidance: string;
}> {
  const coveragePeriods = await db.memberCoveragePeriod.findMany({
    where: { memberId: m.id },
    select: { startDate: true, endDate: true },
  });
  const decision = decideEligibility({
    serviceDate,
    memberExists: true,
    member: {
      status: m.status,
      relationship: m.relationship,
      dateOfBirth: m.dateOfBirth,
      enrollmentDate: m.enrollmentDate,
      coverEndDate: m.coverEndDate,
      packageVersionId: m.packageVersionId,
    },
    client: m.group?.client ? { status: m.group.client.status } : undefined,
    group: m.group ? { status: m.group.status, effectiveDate: m.group.effectiveDate, renewalDate: m.group.renewalDate } : undefined,
    coveragePeriods,
    ageRules: m.package ? { maxAge: m.package.maxAge, dependentMaxAge: m.package.dependentMaxAge } : null,
  });
  const eligible = decision.conclusion === "ELIGIBLE";
  // UAT-HF P03.03. This function used to compute the full evaluator decision and
  // then THROW THE REASON AWAY, returning a binary verdict and one of two generic
  // sentences. The evaluator already knew whether the member was SUSPENDED,
  // LAPSED, in a WAITING_PERIOD or past an AGE_BOUNDARY — the provider surface
  // simply discarded it. That is DEF-058 ("status-only verdict") at its source,
  // and a large part of why nine probes produced one identical string.
  return {
    resultCode: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
    reasonCode: decision.reasonCode,
    safeExplanation: memberSafeText(decision.reasonCode),
    operatorGuidance: operatorGuidanceText(decision.reasonCode),
  };
}
