import Decimal from "decimal.js";
import type { CoContributionRule } from "@prisma/client";

export interface CalculationInput {
  rule: CoContributionRule;
  serviceCost: Decimal;
  memberYtdTotal: Decimal;
  familyYtdTotal: Decimal;
  individualCap: Decimal | null;
  familyCap: Decimal | null;
}

export interface CalculationResult {
  calculatedAmount: Decimal;
  cappedAmount: Decimal;
  finalAmount: Decimal;
  planShare: Decimal;
  annualCapApplied: boolean;
  capsApplied: string[];
}

export function calculateCoContribution(input: CalculationInput): CalculationResult {
  const { rule, serviceCost, memberYtdTotal, familyYtdTotal, individualCap, familyCap } = input;
  const capsApplied: string[] = [];

  // Raw calculated amount based on rule type
  let calculated: Decimal;
  if (rule.type === "NONE") {
    calculated = new Decimal(0);
  } else if (rule.type === "FIXED_AMOUNT") {
    calculated = new Decimal(rule.fixedAmount ?? 0);
  } else if (rule.type === "PERCENTAGE") {
    calculated = serviceCost.mul(rule.percentage ?? 0).div(100);
  } else {
    // HYBRID — percentage with fixed floor/ceiling behaviour: take greater of fixed or percentage
    const pctAmount = serviceCost.mul(rule.percentage ?? 0).div(100);
    const fixedAmount = new Decimal(rule.fixedAmount ?? 0);
    calculated = Decimal.max(pctAmount, fixedAmount);
  }
  const calculatedAmount = calculated;

  // Per-visit cap
  let capped = calculatedAmount;
  if (rule.perVisitCap !== null && rule.perVisitCap !== undefined) {
    const visitCap = new Decimal(rule.perVisitCap);
    if (capped.gt(visitCap)) {
      capped = visitCap;
      capsApplied.push("PER_VISIT_CAP");
    }
  }

  // Per-encounter cap (same as per-visit for now; spec leaves room for separate value)
  if (rule.perEncounterCap !== null && rule.perEncounterCap !== undefined) {
    const encCap = new Decimal(rule.perEncounterCap);
    if (capped.gt(encCap)) {
      capped = encCap;
      capsApplied.push("PER_ENCOUNTER_CAP");
    }
  }
  const cappedAmount = capped;

  // Annual caps — reduce by what member/family has already paid this year
  let finalAmount = cappedAmount;
  let annualCapApplied = false;

  if (individualCap !== null) {
    const remaining = individualCap.sub(memberYtdTotal);
    if (remaining.lte(0)) {
      finalAmount = new Decimal(0);
      annualCapApplied = true;
      capsApplied.push("INDIVIDUAL_ANNUAL_CAP");
    } else if (finalAmount.gt(remaining)) {
      finalAmount = remaining;
      annualCapApplied = true;
      capsApplied.push("INDIVIDUAL_ANNUAL_CAP");
    }
  }

  if (familyCap !== null) {
    const familyRemaining = familyCap.sub(familyYtdTotal);
    if (familyRemaining.lte(0)) {
      finalAmount = new Decimal(0);
      annualCapApplied = true;
      capsApplied.push("FAMILY_ANNUAL_CAP");
    } else if (finalAmount.gt(familyRemaining)) {
      finalAmount = Decimal.min(finalAmount, familyRemaining);
      annualCapApplied = true;
      capsApplied.push("FAMILY_ANNUAL_CAP");
    }
  }

  const planShare = serviceCost.sub(finalAmount);

  return { calculatedAmount, cappedAmount, finalAmount, planShare, annualCapApplied, capsApplied };
}
