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
