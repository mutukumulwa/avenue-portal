/**
 * Claims Autopilot — serializable AutoDecisionPlan + conservation invariants (F4.4).
 *
 * The plan (§10.1) is the ONE immutable, JSON-serializable output of evaluation.
 * F4.5 executes it (LIVE) or stores it as a shadow proposal (SHADOW). All money
 * is decimal STRINGS; line + claim money conserve; every pended/adjusted/declined
 * line carries a reason; route reasons use the audience-safe catalog wording.
 */
import Decimal from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { evaluateClaimStaged } from "./evaluate";
import { getReason, type RouteCode } from "@/server/services/claim-intake/reason-catalog";
import type { PolicyMode } from "./policy";

export interface PlanReason {
  stage: string;
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  internalMessage: string;
  providerMessage: string;
  memberMessage: string | null;
  remedy?: string;
  resubmissionAllowed: boolean;
}

export interface PlanLine {
  claimLineId: string;
  submittedCode?: string;
  normalizedServiceCategoryId?: string | null;
  decision: "APPROVED" | "APPROVED_WITH_ADJUSTMENT" | "DECLINED" | "PENDED";
  billedAmount: string;
  contractedAmount: string;
  payableAmount: string;
  shortfallAmount: string;
  disallowedAmount: string;
  memberLiability: string;
  payerLiability: string;
  providerWriteOff: string;
  reasonCode: string;
  resubmissionAllowed: boolean;
  contractId?: string | null;
  contractVersionId?: string | null;
}

export interface AutoDecisionPlan {
  workflowVersion: string;
  claimId: string;
  claimRevision: number;
  evaluatedAt: string;
  mode: PolicyMode;
  policyId: string | null;
  policyVersion: number | null;
  disposition: "ROUTE" | "APPROVE" | "PARTIAL" | "WOULD_APPROVE" | "WOULD_PARTIAL";
  action?: "APPROVED" | "PARTIALLY_APPROVED";
  totalBilled: string;
  totalPayable: string;
  currency: string;
  routeCode?: string;
  assignedQueue?: string | null;
  reasons: PlanReason[];
  lines: PlanLine[];
  snapshots: { claimUpdatedAt: string; contractVersionIds: string[]; eligibilityAsOf: string };
}

const d2 = (v: Decimal | string | number) => new Decimal(v).toDecimalPlaces(2).toFixed(2);

function reasonFor(stage: string, code: RouteCode, detail: string | null): PlanReason {
  const r = getReason(code);
  return {
    stage, code, severity: "ERROR",
    internalMessage: detail ? `${r.internal} (${detail})` : r.internal,
    providerMessage: r.provider, memberMessage: r.member, remedy: r.remedy, resubmissionAllowed: r.resubmissionAllowed,
  };
}

/** Build the immutable decision plan for a claim revision. */
export async function buildAutoDecisionPlan(
  db: PrismaClient,
  tenantId: string,
  claimId: string,
  runId?: string,
  opts: { duplicateCleared?: boolean } = {},
): Promise<AutoDecisionPlan> {
  const evaluatedAt = new Date().toISOString();
  const evalResult = await evaluateClaimStaged(db, tenantId, claimId, runId, opts);
  const claim = await db.claim.findUniqueOrThrow({
    where: { id: claimId },
    select: {
      claimRevision: true, billedAmount: true, currency: true, updatedAt: true, contractVersionId: true, contractId: true,
      claimLines: { select: { id: true, billedAmount: true, cptCode: true, drugCode: true, icdCode: true, serviceCategoryId: true } },
    },
  });

  const routed = evalResult.disposition === "ROUTE";
  const payableByLine = new Map(evalResult.lines.map((l) => [l.claimLineId, l]));

  const lines: PlanLine[] = claim.claimLines.map((cl) => {
    const billed = new Decimal(String(cl.billedAmount));
    const el = payableByLine.get(cl.id);
    // A routed claim is undecided — no money is allocated to a line.
    const payable = routed ? new Decimal(0) : new Decimal(el?.payableAmount ?? "0");
    const providerWriteOff = routed ? new Decimal(0) : Decimal.max(billed.minus(payable), 0);
    const decision: PlanLine["decision"] = routed ? "PENDED" : el?.decision ?? (payable.equals(billed) ? "APPROVED" : "APPROVED_WITH_ADJUSTMENT");
    return {
      claimLineId: cl.id,
      submittedCode: cl.cptCode ?? cl.drugCode ?? cl.icdCode ?? undefined,
      normalizedServiceCategoryId: cl.serviceCategoryId ?? undefined,
      decision,
      billedAmount: d2(billed),
      contractedAmount: d2(payable),
      payableAmount: d2(payable),
      shortfallAmount: d2(providerWriteOff),
      disallowedAmount: "0.00",
      memberLiability: "0.00",
      payerLiability: d2(payable),
      providerWriteOff: d2(providerWriteOff),
      reasonCode: routed ? (evalResult.routeCode ?? "ROUTED") : decision,
      resubmissionAllowed: routed && evalResult.routeCode ? getReason(evalResult.routeCode as RouteCode).resubmissionAllowed : false,
      contractId: el?.contractId ?? claim.contractId ?? null,
      contractVersionId: el?.contractVersionId ?? claim.contractVersionId ?? null,
    };
  });

  const totalBilled = lines.reduce((s, l) => s.plus(l.billedAmount), new Decimal(0));
  const totalPayable = lines.reduce((s, l) => s.plus(l.payerLiability), new Decimal(0));

  const disposition: AutoDecisionPlan["disposition"] = routed
    ? "ROUTE"
    : evalResult.mode === "LIVE"
      ? totalPayable.lt(totalBilled)
        ? "PARTIAL"
        : "APPROVE"
      : totalPayable.lt(totalBilled)
        ? "WOULD_PARTIAL"
        : "WOULD_APPROVE";

  return {
    workflowVersion: "v1",
    claimId,
    claimRevision: claim.claimRevision,
    evaluatedAt,
    mode: evalResult.mode,
    policyId: evalResult.policyId,
    policyVersion: null,
    disposition,
    action: disposition === "APPROVE" || disposition === "PARTIAL" ? (disposition === "PARTIAL" ? "PARTIALLY_APPROVED" : "APPROVED") : undefined,
    totalBilled: d2(totalBilled),
    totalPayable: d2(totalPayable),
    currency: claim.currency,
    routeCode: evalResult.routeCode ?? undefined,
    assignedQueue: routed && evalResult.routeCode ? getReason(evalResult.routeCode as RouteCode).queue : undefined,
    reasons: routed && evalResult.routeCode ? [reasonFor(evalResult.routeStage ?? "POLICY", evalResult.routeCode as RouteCode, evalResult.reason)] : [],
    lines,
    snapshots: {
      claimUpdatedAt: claim.updatedAt.toISOString(),
      contractVersionIds: [...new Set(lines.map((l) => l.contractVersionId).filter((v): v is string => !!v))],
      eligibilityAsOf: evaluatedAt,
    },
  };
}

/** Assert the plan's line + claim money conserves (§11.7). Returns blocking errors. */
export function validatePlanConservation(plan: AutoDecisionPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const EPS = new Decimal("0.01");

  const sumBilled = plan.lines.reduce((s, l) => s.plus(l.billedAmount), new Decimal(0));
  if (new Decimal(plan.totalBilled).minus(sumBilled).abs().gt(EPS)) errors.push(`totalBilled ${plan.totalBilled} != Σ line billed ${sumBilled}`);

  const sumPayer = plan.lines.reduce((s, l) => s.plus(l.payerLiability), new Decimal(0));
  if (new Decimal(plan.totalPayable).minus(sumPayer).abs().gt(EPS)) errors.push(`totalPayable ${plan.totalPayable} != Σ payerLiability ${sumPayer}`);

  const decided = plan.disposition !== "ROUTE";
  for (const l of plan.lines) {
    // Every pended/adjusted/declined line must carry a reason.
    if (l.decision !== "APPROVED" && !l.reasonCode) errors.push(`line ${l.claimLineId} (${l.decision}) has no reason code`);
    // For a decided plan, each line conserves: billed = payer + member + writeoff + disallowed.
    if (decided) {
      const parts = new Decimal(l.payerLiability).plus(l.memberLiability).plus(l.providerWriteOff).plus(l.disallowedAmount);
      if (new Decimal(l.billedAmount).minus(parts).abs().gt(EPS)) errors.push(`line ${l.claimLineId}: billed ${l.billedAmount} != payer+member+writeoff+disallowed ${parts}`);
    }
  }
  // A routed plan pays nothing automatically.
  if (plan.disposition === "ROUTE" && !new Decimal(plan.totalPayable).equals(0)) errors.push(`routed plan has non-zero payable ${plan.totalPayable}`);

  return { valid: errors.length === 0, errors };
}
