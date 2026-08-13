import { prisma } from "@/lib/prisma";
import { Prisma, BenefitCategory, type PrismaClient } from "@prisma/client";
import { BenefitUsageService } from "../benefit-usage.service";
import { coverageService, isCoverageEnded } from "../coverage.service";
import {
  evaluateExclusions,
  evaluateReferral,
  type ExclusionExceptionLogic,
} from "./rules";
import { isProviderExcluded, isEmergencyBenefit, type ProviderEligibilityRuleView } from "./entitlement";
import {
  decideEligibility,
  type EligibilityFacts,
  type EligibilityDecision,
  type EligibilityConclusion,
  type BenefitMoney,
} from "./evaluator-core";
import type { EligibilityReasonCode } from "./reason-codes";

/**
 * evaluator.ts — SP-6: THE single point-in-time eligibility evaluator.
 *
 * `evaluateEligibility` collapses the eight divergent "is-eligible" evaluators and
 * seven "remaining-benefit" calculators into one:
 *  - money base = `BenefitUsageService.computeAvailability` on the member's PINNED
 *    package version (never "latest") — per-visit / category / OVERALL / shared
 *    pools with expiry-reconciled holds + PA credit-back;
 *  - entitlement base = the preauth Gate 1–4 inputs (coverEnd, provider network,
 *    membership exclusions, waiting periods), plus the four inputs no evaluator
 *    consulted (client status, group status, group policy window, as-of-service
 *    coverage) and the structured exclusion/referral rules (Wave 2);
 *  - the verdict + reason mapping is the pure `decideEligibility` core.
 *
 * Every channel (admin / provider / member / HR / provider API / preauth-claims)
 * rewires to this. Adapters may PROJECT (hide fields) but must never RECOMPUTE.
 */

export interface EligibilityInput {
  tenantId: string;
  /** Member number, e.g. "LMU-UAT-0001". Case-insensitive. */
  memberRef: string;
  serviceDate?: Date;
  /** BenefitCategory or a context code (e.g. SPECIALIST_OUTPATIENT / EMERGENCY). */
  benefitCode?: string | null;
  providerId?: string | null;
  providerBranchId?: string | null;
  /** A valid referral is on file for this service (claims/manual review may set it). */
  hasReferral?: boolean;
  /** Force the emergency-context flag (else derived from benefitCode). */
  isEmergency?: boolean;
}

export interface EligibilityResult {
  conclusion: EligibilityConclusion;
  reasonCode: EligibilityReasonCode;
  /** Member-life status reason as of the service date (independent of the benefit). */
  memberStatusAsOf: EligibilityReasonCode;
  policyWindow: { start: Date | null; end: Date | null; inWindow: boolean };
  packageVersionId: string | null;
  /** Category sublimit / usage on the pinned version (0 when no benefit context). */
  limit: number;
  used: number;
  held: number;
  /** Headline available money; null when not priceable. */
  remaining: number | null;
  requiresPreauth: boolean;
  network: { providerId: string | null; branchId: string | null; inNetwork: boolean | null };
  copay: { percentage: number | null };
  benefitCode: string | null;
  serviceDate: Date;
  explanations: string[];
  /** Internal: true only when the member exists + is in tenant scope. */
  found: boolean;
  memberId: string | null;
}

type Db = PrismaClient | Prisma.TransactionClient;

const VALID_BENEFIT_CATEGORIES = new Set<string>(Object.values(BenefitCategory));

function isBenefitCategory(code: string | null | undefined): code is BenefitCategory {
  return !!code && VALID_BENEFIT_CATEGORIES.has(code);
}

/** Fail-closed NOT_FOUND with zero existence leakage (EO-024). */
function notFoundResult(serviceDate: Date, benefitCode: string | null, providerId: string | null, providerBranchId: string | null): EligibilityResult {
  return {
    conclusion: "NOT_FOUND",
    reasonCode: "NOT_FOUND",
    memberStatusAsOf: "NOT_FOUND",
    policyWindow: { start: null, end: null, inWindow: false },
    packageVersionId: null,
    limit: 0,
    used: 0,
    held: 0,
    remaining: null,
    requiresPreauth: false,
    network: { providerId, branchId: providerBranchId, inNetwork: null },
    copay: { percentage: null },
    benefitCode,
    serviceDate,
    explanations: ["No member matches this reference."],
    found: false,
    memberId: null,
  };
}

export async function evaluateEligibility(input: EligibilityInput, db: Db = prisma): Promise<EligibilityResult> {
  const serviceDate = input.serviceDate ?? new Date();
  const benefitCode = input.benefitCode ?? null;
  const providerId = input.providerId ?? null;
  const providerBranchId = input.providerBranchId ?? null;

  // ── resolve member (tenant-scoped, case-insensitive) ──
  const member = await db.member.findFirst({
    where: { tenantId: input.tenantId, memberNumber: { equals: input.memberRef, mode: "insensitive" } },
    select: {
      id: true,
      status: true,
      relationship: true,
      dateOfBirth: true,
      enrollmentDate: true,
      coverEndDate: true,
      packageVersionId: true,
      packageId: true,
      groupId: true,
      group: {
        select: {
          status: true,
          effectiveDate: true,
          renewalDate: true,
          clientId: true,
          client: { select: { status: true } },
        },
      },
      package: { select: { maxAge: true, dependentMaxAge: true } },
    },
  });

  if (!member) return notFoundResult(serviceDate, benefitCode, providerId, providerBranchId);

  const pinned = member.packageVersionId;

  // ── coverage periods (as-of-service-date). coverageService.evaluate is the
  //    canonical as-of interface (WP-3.5E populates periods for every enrolment
  //    path — the evaluator then completes those cases with no change here). The
  //    raw periods drive the gap/reinstatement classification in the core. ──
  const endedLike = isCoverageEnded(member.status) || member.status === "LAPSED";
  const [rawPeriods] = await Promise.all([
    db.memberCoveragePeriod.findMany({ where: { memberId: member.id }, select: { startDate: true, endDate: true } }),
    // called for its side-effect of routing through the canonical interface; the
    // core subsumes its covered decision and extends it (gap/reinstatement).
    coverageService.evaluate(db, member.id, serviceDate, { ignoreOpenPeriods: endedLike }).catch(() => null),
  ]);

  // ── money base — pinned version, holds reconciled (only for real categories) ──
  let benefitMoney: BenefitMoney | null = null;
  let copayPercentage: number | null = null;
  if (pinned && isBenefitCategory(benefitCode)) {
    try {
      const avail = await BenefitUsageService.computeAvailability(db, {
        memberId: member.id,
        benefitCategory: benefitCode,
        requestedAmount: 0,
        serviceDate,
      });
      if (avail) {
        const cat = avail.constraints.find((c) => c.kind === "CATEGORY");
        benefitMoney = {
          limit: cat?.limit ?? 0,
          used: cat?.used ?? 0,
          held: cat?.held ?? 0,
          remaining: avail.payableCeiling,
        };
      }
    } catch {
      // DEC-06 data-quality throw (dependant with a family pool but no principal):
      // don't 500 the eligibility read — money is unknown, member eligibility stands.
      benefitMoney = null;
    }
    const cfg = await db.benefitConfig.findFirst({
      where: { packageVersionId: pinned, category: benefitCode },
      select: { copayPercentage: true },
    });
    copayPercentage = cfg ? Number(cfg.copayPercentage) : null;
  }

  // ── provider network (only when a provider is supplied) ──
  let providerExcluded: boolean | undefined;
  if (providerId) {
    const [provider, providerRules] = await Promise.all([
      db.provider.findFirst({
        where: { id: providerId, tenantId: input.tenantId },
        select: { id: true, tier: true, contractStatus: true },
      }),
      pinned
        ? db.packageProviderEligibility.findMany({
            where: { packageVersionId: pinned },
            // P09.05: precedence needs the rule's identity, rank tie-break and
            // effective window, not just its direction.
            select: {
              id: true,
              providerId: true,
              providerTier: true,
              inclusionType: true,
              priority: true,
              effectiveFrom: true,
              effectiveTo: true,
              isActive: true,
            },
          })
        : Promise.resolve([]),
    ]);
    providerExcluded = isProviderExcluded(
      providerRules as ProviderEligibilityRuleView[],
      provider ? { id: provider.id, tier: String(provider.tier), contractStatus: provider.contractStatus } : null,
    );
  }

  // ── structured referral + exclusion (pinned version rules) ──
  let referral: EligibilityFacts["referral"] = null;
  let exclusion: EligibilityFacts["exclusion"] = null;
  if (pinned) {
    const [referralRules, exclusionRules] = await Promise.all([
      db.referralRule.findMany({ where: { packageVersionId: pinned, isActive: true } }),
      db.treatmentExclusionRule.findMany({ where: { packageVersionId: pinned, isActive: true } }),
    ]);
    if (referralRules.length > 0) {
      referral = evaluateReferral(
        referralRules.map((r) => ({
          id: r.id,
          benefitCategories: r.benefitCategories,
          serviceCodes: r.serviceCodes,
          providerSpecialties: r.providerSpecialties,
          requiresReferral: r.requiresReferral,
          emergencyException: r.emergencyException,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          memberSafeExplanation: r.memberSafeExplanation,
          isActive: r.isActive,
        })),
        {
          serviceDate,
          benefitCategory: benefitCode,
          isEmergency: input.isEmergency ?? isEmergencyBenefit(benefitCode),
          hasReferral: input.hasReferral ?? false,
        },
      );
    }
    if (exclusionRules.length > 0) {
      exclusion = evaluateExclusions(
        exclusionRules.map((r) => ({
          id: r.id,
          ruleCategory: r.ruleCategory,
          exclusionType: r.exclusionType,
          benefitCategories: r.benefitCategories,
          serviceCodes: r.serviceCodes,
          diagnosisCodes: r.diagnosisCodes,
          procedureCodes: r.procedureCodes,
          exceptionLogic: (r.exceptionLogic ?? null) as ExclusionExceptionLogic | null,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          memberSafeExplanation: r.memberSafeExplanation,
          isActive: r.isActive,
        })),
        { serviceDate, benefitCategory: benefitCode },
      );
    }
  }

  // ── waiting period (benefit-level, real categories only) ──
  let waitingBlocked = false;
  if (isBenefitCategory(benefitCode)) {
    const waits = await db.waitingPeriodApplication.findMany({
      where: {
        tenantId: input.tenantId,
        memberId: member.id,
        isActive: true,
        endDate: { gt: serviceDate },
        benefitCategories: { has: benefitCode },
      },
      select: { id: true },
    });
    waitingBlocked = waits.length > 0;
  }

  // ── assemble facts + decide ──
  const facts: EligibilityFacts = {
    serviceDate,
    memberExists: true,
    member: {
      status: member.status,
      relationship: member.relationship,
      dateOfBirth: member.dateOfBirth,
      enrollmentDate: member.enrollmentDate,
      coverEndDate: member.coverEndDate,
      packageVersionId: pinned,
    },
    client: member.group?.client ? { status: member.group.client.status } : undefined,
    group: member.group
      ? { status: member.group.status, effectiveDate: member.group.effectiveDate, renewalDate: member.group.renewalDate }
      : undefined,
    coveragePeriods: rawPeriods,
    ageRules: member.package ? { maxAge: member.package.maxAge, dependentMaxAge: member.package.dependentMaxAge } : null,
    benefitCode,
    providerId,
    providerExcluded,
    referral,
    exclusion,
    waitingBlocked,
    benefitMoney,
  };

  const decision: EligibilityDecision = decideEligibility(facts);

  return {
    conclusion: decision.conclusion,
    reasonCode: decision.reasonCode,
    memberStatusAsOf: decision.memberReason,
    policyWindow: {
      start: member.group?.effectiveDate ?? null,
      end: member.group?.renewalDate ?? null,
      inWindow:
        decision.reasonCode !== "POLICY_NOT_STARTED" && decision.reasonCode !== "RENEWAL_VERSION",
    },
    packageVersionId: pinned,
    limit: benefitMoney?.limit ?? 0,
    used: benefitMoney?.used ?? 0,
    held: benefitMoney?.held ?? 0,
    remaining: decision.available,
    requiresPreauth: false, // projection stub — wire to contract/benefit PA rules in a follow-on
    network: {
      providerId,
      branchId: providerBranchId,
      inNetwork: providerId ? providerExcluded !== true : null,
    },
    copay: { percentage: copayPercentage },
    benefitCode,
    serviceDate,
    explanations: decision.explanations,
    found: true,
    memberId: member.id,
  };
}

// ── channel projections (hide fields; never recompute) ─────────────────────────

/** Member-safe boolean the provider portal / API needs for a green/amber/red badge. */
export function conclusionIsEligible(conclusion: EligibilityConclusion): boolean {
  return conclusion === "ELIGIBLE";
}

/**
 * Provider projection (§8.1): a provider sees the point-in-time verdict, network
 * status, remaining balance for the queried benefit and the member-safe
 * explanation — but NOT the tenant-wide utilization history (used/held/limit) or
 * any other member's data (the evaluator is single-member by construction).
 */
export interface ProviderEligibilityProjection {
  conclusion: EligibilityConclusion;
  reasonCode: EligibilityReasonCode;
  isEligible: boolean;
  requiresPreauth: boolean;
  network: EligibilityResult["network"];
  /** Remaining balance for the queried benefit only (null when not priceable). */
  remaining: number | null;
  copay: { percentage: number | null };
  benefitCode: string | null;
  serviceDate: Date;
  explanations: string[];
}

export function projectForProvider(r: EligibilityResult): ProviderEligibilityProjection {
  return {
    conclusion: r.conclusion,
    reasonCode: r.reasonCode,
    isEligible: conclusionIsEligible(r.conclusion),
    requiresPreauth: r.requiresPreauth,
    network: r.network,
    remaining: r.remaining,
    copay: r.copay,
    benefitCode: r.benefitCode,
    serviceDate: r.serviceDate,
    explanations: r.explanations,
  };
}

/** Admin/HR/member internal projection: full usage detail on the pinned version. */
export interface InternalEligibilityProjection {
  conclusion: EligibilityConclusion;
  reasonCode: EligibilityReasonCode;
  memberStatusAsOf: EligibilityReasonCode;
  policyWindow: EligibilityResult["policyWindow"];
  packageVersionId: string | null;
  limit: number;
  used: number;
  held: number;
  remaining: number | null;
  requiresPreauth: boolean;
  network: EligibilityResult["network"];
  copay: { percentage: number | null };
  benefitCode: string | null;
  serviceDate: Date;
  explanations: string[];
}

// ── per-benefit balance summary (money-base projection) ────────────────────────

export interface BenefitBalanceRow {
  category: string;
  limit: number;
  used: number;
  held: number;
  remaining: number;
}
export interface MemberBenefitSummary {
  packageVersionId: string | null;
  rows: BenefitBalanceRow[];
  totals: { limit: number; used: number; held: number; remaining: number };
}

/**
 * Per-category balance summary for a member on their PINNED version, projected
 * from the SAME money base the evaluator uses (`computeAvailability`: category +
 * OVERALL + shared pools + expiry-reconciled holds). Channels that need a balance
 * table (admin / HR / member) call this instead of re-summing usage rows — the
 * repeated source of the split-brain remaining numbers.
 */
export async function memberBenefitSummary(
  memberId: string,
  serviceDate?: Date,
  db: Db = prisma,
): Promise<MemberBenefitSummary> {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { packageVersionId: true, package: { select: { annualLimit: true } } },
  });
  const pinned = member?.packageVersionId ?? null;
  if (!pinned) return { packageVersionId: null, rows: [], totals: { limit: 0, used: 0, held: 0, remaining: 0 } };

  const now = serviceDate ?? new Date();
  const configs = await db.benefitConfig.findMany({ where: { packageVersionId: pinned }, select: { category: true } });
  const rows: BenefitBalanceRow[] = [];
  for (const cfg of configs) {
    const avail = await BenefitUsageService.computeAvailability(db, {
      memberId,
      benefitCategory: cfg.category,
      requestedAmount: 0,
      serviceDate: now,
    }).catch(() => null);
    if (!avail) continue;
    const cat = avail.constraints.find((c) => c.kind === "CATEGORY");
    rows.push({
      category: String(cfg.category),
      limit: cat?.limit ?? 0,
      used: cat?.used ?? 0,
      held: cat?.held ?? 0,
      remaining: avail.payableCeiling,
    });
  }

  const categoryLimit = rows.reduce((s, r) => s + r.limit, 0);
  const overall = member?.package?.annualLimit != null ? Number(member.package.annualLimit) : 0;
  const totalLimit = overall > 0 ? overall : categoryLimit;
  const totalUsed = Math.min(rows.reduce((s, r) => s + r.used, 0), totalLimit);
  const totalHeld = Math.min(rows.reduce((s, r) => s + r.held, 0), Math.max(0, totalLimit - totalUsed));
  return {
    packageVersionId: pinned,
    rows,
    totals: { limit: totalLimit, used: totalUsed, held: totalHeld, remaining: Math.max(0, totalLimit - totalUsed - totalHeld) },
  };
}

export function projectForInternal(r: EligibilityResult): InternalEligibilityProjection {
  return {
    conclusion: r.conclusion,
    reasonCode: r.reasonCode,
    memberStatusAsOf: r.memberStatusAsOf,
    policyWindow: r.policyWindow,
    packageVersionId: r.packageVersionId,
    limit: r.limit,
    used: r.used,
    held: r.held,
    remaining: r.remaining,
    requiresPreauth: r.requiresPreauth,
    network: r.network,
    copay: r.copay,
    benefitCode: r.benefitCode,
    serviceDate: r.serviceDate,
    explanations: r.explanations,
  };
}
