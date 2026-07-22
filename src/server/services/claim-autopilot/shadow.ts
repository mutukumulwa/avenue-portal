/**
 * Claims Autopilot — shadow mode (F4.6).
 *
 * Under a SHADOW policy the pipeline evaluates and stores the PROPOSED outcome but
 * moves NO money (D2) — the claim routes to normal human processing. When a human
 * later decides, the proposal is compared to the actual outcome to measure
 * automation accuracy before LIVE activation (the §14.2 shadow exit gate).
 *
 * The proposal is stored as the run's DECISION stage result (safe totals only).
 */
import Decimal from "decimal.js";
import type { PrismaClient, Prisma } from "@prisma/client";
import { recordStage } from "@/server/services/claim-intake/processing";
import type { AutoDecisionPlan } from "./plan";

export interface ShadowProposal {
  mode: "SHADOW";
  disposition: string;
  action: string | null;
  totalPayable: string;
  totalBilled: string;
  currency: string;
  routeCode: string | null;
  lineCount: number;
}

/** Record the shadow proposal on the run's DECISION stage (no money mutation). */
export async function storeShadowProposal(db: PrismaClient, runId: string, plan: AutoDecisionPlan): Promise<void> {
  const proposal: ShadowProposal = {
    mode: "SHADOW",
    disposition: plan.disposition,
    action: plan.action ?? null,
    totalPayable: plan.totalPayable,
    totalBilled: plan.totalBilled,
    currency: plan.currency,
    routeCode: plan.routeCode ?? null,
    lineCount: plan.lines.length,
  };
  await recordStage(db, runId, "DECISION", { state: "PASSED", reasonCode: "SHADOW_PROPOSAL", result: proposal as unknown as Prisma.InputJsonValue, currentStage: true });
}

export interface ShadowComparison {
  claimId: string;
  shadowDisposition: string;
  shadowPayable: string;
  humanStatus: string;
  humanApprovedAmount: string;
  dispositionAgreed: boolean;
  amountAgreed: boolean;
  agreed: boolean;
}

/**
 * Compare the latest shadow proposal for a claim to the human decision, once the
 * claim has actually been decided. Returns null while the claim is undecided.
 */
export async function compareShadowToOutcome(db: PrismaClient, claimId: string): Promise<ShadowComparison | null> {
  const run = await db.claimProcessingRun.findFirst({
    where: { claimId, state: "SHADOW_COMPLETE" },
    orderBy: { createdAt: "desc" },
    include: { stages: { where: { stage: "DECISION" }, select: { result: true } } },
  });
  const raw = run?.stages[0]?.result as ShadowProposal | undefined;
  if (!raw) return null;

  const claim = await db.claim.findUnique({ where: { id: claimId }, select: { status: true, approvedAmount: true } });
  if (!claim || !["APPROVED", "PARTIALLY_APPROVED", "DECLINED"].includes(claim.status)) return null; // not yet humanly decided

  const shadowApprove = raw.disposition === "WOULD_APPROVE" || raw.disposition === "WOULD_PARTIAL" || raw.disposition === "APPROVE" || raw.disposition === "PARTIAL";
  const humanApprove = ["APPROVED", "PARTIALLY_APPROVED"].includes(claim.status);
  const dispositionAgreed = shadowApprove === humanApprove;
  const amountAgreed = shadowApprove && humanApprove
    ? new Decimal(String(claim.approvedAmount)).minus(raw.totalPayable).abs().lte("0.01")
    : dispositionAgreed;

  return {
    claimId,
    shadowDisposition: raw.disposition,
    shadowPayable: raw.totalPayable,
    humanStatus: claim.status,
    humanApprovedAmount: new Decimal(String(claim.approvedAmount)).toFixed(2),
    dispositionAgreed,
    amountAgreed,
    agreed: dispositionAgreed && amountAgreed,
  };
}

export interface ShadowAgreementMetrics {
  compared: number;
  agreed: number;
  overturned: number;
  agreementRate: number; // 0..1
}

/** Aggregate agreement across all shadow-completed, humanly-decided claims for a tenant. */
export async function shadowAgreementMetrics(db: PrismaClient, tenantId: string): Promise<ShadowAgreementMetrics> {
  const runs = await db.claimProcessingRun.findMany({ where: { tenantId, state: "SHADOW_COMPLETE" }, select: { claimId: true }, distinct: ["claimId"] });
  let compared = 0;
  let agreed = 0;
  for (const r of runs) {
    const c = await compareShadowToOutcome(db, r.claimId);
    if (!c) continue;
    compared += 1;
    if (c.agreed) agreed += 1;
  }
  return { compared, agreed, overturned: compared - agreed, agreementRate: compared === 0 ? 1 : agreed / compared };
}
