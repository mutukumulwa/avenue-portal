/**
 * Cost-share computation (Medvex spec / gap G9.1) — co-insurance & deductibles,
 * distinct from copay. The member pays the annual deductible first (up to the
 * remaining threshold), then a co-insurance percentage of the cost above the
 * deductible; the plan pays the rest. Pure/deterministic for adjudication.
 *
 * Note: copay (CoContributionRule) is a separate, additive construct handled by
 * the co-contribution engine; this covers the deductible + co-insurance the
 * platform previously lacked.
 */

export interface CostShareInput {
  serviceCost: number;
  coInsurancePct: number; // 0..100
  deductibleAmount: number; // annual threshold (0 = none)
  deductibleMetToDate: number; // member's deductible already paid this period
}

export interface CostShareResult {
  deductibleApplied: number; // member pays (toward the deductible)
  coInsuranceApplied: number; // member pays (share above the deductible)
  memberPays: number;
  planPays: number;
  newDeductibleMet: number; // running deductible-met after this claim
}

export function computeCostShare(input: CostShareInput): CostShareResult {
  const cost = Math.max(0, input.serviceCost);
  const pct = Math.min(100, Math.max(0, input.coInsurancePct));

  const deductibleRemaining = Math.max(0, input.deductibleAmount - input.deductibleMetToDate);
  const deductibleApplied = Math.min(cost, deductibleRemaining);

  const afterDeductible = cost - deductibleApplied;
  const coInsuranceApplied = round2(afterDeductible * (pct / 100));

  const memberPays = round2(deductibleApplied + coInsuranceApplied);
  const planPays = round2(cost - memberPays);

  return {
    deductibleApplied: round2(deductibleApplied),
    coInsuranceApplied,
    memberPays,
    planPays,
    newDeductibleMet: round2(input.deductibleMetToDate + deductibleApplied),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── DB-aware resolution (adjudication wire-in) ────────────────────────────────

/** Annual benefit period anchored to the member's enrollment anniversary
 * (same anchoring as BenefitUsage reservation). */
export function benefitPeriodFor(enrollmentDate: Date, now = new Date()): { periodStart: Date; periodEnd: Date } {
  const enroll = new Date(enrollmentDate);
  let periodStart = new Date(now.getFullYear(), enroll.getMonth(), enroll.getDate());
  if (periodStart > now) periodStart = new Date(now.getFullYear() - 1, enroll.getMonth(), enroll.getDate());
  const periodEnd = new Date(periodStart.getFullYear() + 1, enroll.getMonth(), enroll.getDate());
  return { periodStart, periodEnd };
}

export interface AppliedCostShare extends CostShareResult {
  /** BenefitConfig.copayPercentage (0 when no config) — legacy % copay, distinct from cost-share. */
  copayPercentage: number;
  benefitConfigId: string | null;
}

const ZERO: AppliedCostShare = {
  deductibleApplied: 0, coInsuranceApplied: 0, memberPays: 0, planPays: 0,
  newDeductibleMet: 0, copayPercentage: 0, benefitConfigId: null,
};

/**
 * Minimal DB surface so the resolver runs inside a Prisma transaction client or
 * the root client alike (and is trivially mockable in tests).
 */
export interface CostShareDb {
  member: { findUnique: (args: never) => Promise<{ packageVersionId: string | null; enrollmentDate: Date } | null> };
  benefitConfig: { findFirst: (args: never) => Promise<{ id: string; coInsurancePct: unknown; deductibleAmount: unknown; copayPercentage: unknown } | null> };
  benefitUsage: {
    findUnique: (args: never) => Promise<{ deductibleMet: unknown } | null>;
    upsert: (args: never) => Promise<unknown>;
  };
}

export class CostShareResolver {
  /**
   * Resolve the member's BenefitConfig for the category, compute the
   * deductible + co-insurance split for `approvedAmount`, and persist the
   * period's running deductible-met on BenefitUsage. Returns ZERO (plan pays
   * all) when no config or no cost-share is configured.
   */
  static async applyForClaim(
    db: CostShareDb,
    memberId: string,
    benefitCategory: string,
    approvedAmount: number,
  ): Promise<AppliedCostShare> {
    if (approvedAmount <= 0) return { ...ZERO, planPays: 0 };

    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { packageVersionId: true, enrollmentDate: true },
    } as never);
    if (!member?.packageVersionId) return { ...ZERO, planPays: approvedAmount };

    const config = await db.benefitConfig.findFirst({
      where: { packageVersionId: member.packageVersionId, category: benefitCategory },
      select: { id: true, coInsurancePct: true, deductibleAmount: true, copayPercentage: true },
    } as never);
    if (!config) return { ...ZERO, planPays: approvedAmount };

    const coInsurancePct = Number(config.coInsurancePct ?? 0);
    const deductibleAmount = Number(config.deductibleAmount ?? 0);
    const copayPercentage = Number(config.copayPercentage ?? 0);

    if (coInsurancePct <= 0 && deductibleAmount <= 0) {
      return { ...ZERO, planPays: approvedAmount, copayPercentage, benefitConfigId: config.id };
    }

    const { periodStart, periodEnd } = benefitPeriodFor(member.enrollmentDate);
    const usage = await db.benefitUsage.findUnique({
      where: { memberId_benefitConfigId_periodStart: { memberId, benefitConfigId: config.id, periodStart } },
      select: { deductibleMet: true },
    } as never);

    const result = computeCostShare({
      serviceCost: approvedAmount,
      coInsurancePct,
      deductibleAmount,
      deductibleMetToDate: Number(usage?.deductibleMet ?? 0),
    });

    if (result.deductibleApplied > 0) {
      await db.benefitUsage.upsert({
        where: { memberId_benefitConfigId_periodStart: { memberId, benefitConfigId: config.id, periodStart } },
        update: { deductibleMet: { increment: result.deductibleApplied } },
        create: {
          memberId, benefitConfigId: config.id, periodStart, periodEnd,
          amountUsed: 0, deductibleMet: result.deductibleApplied,
        },
      } as never);
    }

    return { ...result, copayPercentage, benefitConfigId: config.id };
  }
}
