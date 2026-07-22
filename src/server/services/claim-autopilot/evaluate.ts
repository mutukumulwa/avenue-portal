/**
 * Claims Autopilot — read-only staged evaluation (F4.2).
 *
 * Decomposes automation evaluation into the §6.5 named stages. Each stage is a
 * THIN adapter over an EXISTING owner (coverage, entitlement, contract engine,
 * benefit, fraud, …) — this is a process trace, not a second rules engine. The
 * evaluator is READ-ONLY with respect to claim/line money and status: it writes
 * only stage rows (F3.5) and idempotent fraud alerts (step 6). It stops at the
 * first blocking route and marks later stages SKIPPED. The serializable
 * `AutoDecisionPlan` is assembled from this in F4.4; execution is F4.5.
 */
import Decimal from "decimal.js";
import type { PrismaClient, ClaimProcessingStageName, Prisma } from "@prisma/client";
import { recordStage, safeErrorMessage } from "@/server/services/claim-intake/processing";
import { ROUTE_CODES, type RouteCode } from "@/server/services/claim-intake/reason-catalog";
import { effectivePolicyMode, type PolicyLike, type PolicyMode } from "./policy";

type Db = PrismaClient;

export type StageOutcome =
  | { disposition: "PASS"; result?: Record<string, unknown> }
  | { disposition: "ROUTE"; code: RouteCode; reason: string; result?: Record<string, unknown> };

const PASS: StageOutcome = { disposition: "PASS" };
const routeOut = (code: RouteCode, reason: string, result?: Record<string, unknown>): StageOutcome => ({ disposition: "ROUTE", code, reason, result });

interface LinePlan {
  claimLineId: string;
  payableAmount: string;
  billedAmount: string;
}

export interface EvalContext {
  db: Db;
  tenantId: string;
  claimId: string;
  claim: LoadedClaim;
  policy: PolicyLike & { id: string; maxAutoApproveAmount: unknown; currency: string; allowedSources: string[]; allowedServiceTypes: string[]; allowedBenefitCategories: string[] };
  mode: PolicyMode;
  // Accumulated by CONTRACT:
  approveAmount?: string;
  lines: LinePlan[];
}

interface LoadedClaim {
  id: string;
  source: string;
  serviceType: string;
  benefitCategory: string;
  billedAmount: unknown;
  currency: string | null;
  memberId: string;
  providerId: string;
  dateOfService: Date;
  invoiceNumber: string | null;
  member: { status: string; group: { status: string; clientId: string | null } | null } | null;
  claimLines: Array<{ id: string; cptCode: string | null; drugCode: string | null; icdCode: string | null; serviceCategory: string; billedAmount: unknown }>;
}

export interface EvaluationResult {
  disposition: "APPROVE" | "WOULD_APPROVE" | "ROUTE";
  mode: PolicyMode;
  routeCode: RouteCode | null;
  routeStage: ClaimProcessingStageName | null;
  reason: string | null;
  approveAmount: string | null;
  lines: LinePlan[];
  policyId: string | null;
}

// ── Stage adapters (each thin over an existing owner) ─────────────────────────

const stageContext = async (ctx: EvalContext): Promise<StageOutcome> =>
  ctx.claim ? { disposition: "PASS", result: { memberId: ctx.claim.memberId, providerId: ctx.claim.providerId, source: ctx.claim.source } } : routeOut(ROUTE_CODES.ELIGIBILITY_REVIEW, "claim context missing");

async function stageEligibility(ctx: EvalContext): Promise<StageOutcome> {
  const { coverageService, isCoverageEnded } = await import("@/server/services/coverage.service");
  const member = ctx.claim.member;
  if (!member) return routeOut(ROUTE_CODES.ELIGIBILITY_REVIEW, "member not found");
  if (["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.status)) return routeOut(ROUTE_CODES.ELIGIBILITY_REVIEW, `member ${member.status}`);
  if (member.group && ["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.group.status)) return routeOut(ROUTE_CODES.ELIGIBILITY_REVIEW, `group ${member.group.status}`);
  const cov = await coverageService.evaluate(ctx.db, ctx.claim.memberId, ctx.claim.dateOfService, { ignoreOpenPeriods: isCoverageEnded(member.status) });
  if (cov.hasPeriods && !cov.covered) return routeOut(ROUTE_CODES.ELIGIBILITY_REVIEW, "outside coverage window for service date");
  return PASS;
}

async function stageCoding(ctx: EvalContext): Promise<StageOutcome> {
  // A line is codeable if it has any code; uncoded lines cannot be live-priced (D5).
  const uncoded = ctx.claim.claimLines.filter((l) => !l.cptCode && !l.drugCode && !l.icdCode);
  if (uncoded.length > 0) return routeOut(ROUTE_CODES.PRICING_INCOMPLETE, `${uncoded.length} uncoded line(s)`, { uncoded: uncoded.length });
  return PASS;
}

// DOCUMENTS is completed in F4.3 (contract/service-date documentation rules).
const stageDocuments = async (): Promise<StageOutcome> => PASS;

async function stageDuplicate(ctx: EvalContext): Promise<StageOutcome> {
  const { claimAdjudicationService } = await import("@/server/services/claim-adjudication.service");
  const gates = await claimAdjudicationService.runHardGateValidation(ctx.tenantId, {
    providerId: ctx.claim.providerId,
    memberId: ctx.claim.memberId,
    dateOfService: ctx.claim.dateOfService,
    benefitCategory: ctx.claim.benefitCategory as never,
    invoiceNumber: ctx.claim.invoiceNumber ?? undefined,
    excludeClaimId: ctx.claimId,
  });
  if (!gates.passed) return routeOut(ROUTE_CODES.DUPLICATE_REVIEW, gates.errors[0] ?? "duplicate/double-capture");
  return PASS;
}

async function stageContract(ctx: EvalContext): Promise<StageOutcome> {
  const { ContractEngine } = await import("@/server/services/contract-engine/engine");
  const engine = await ContractEngine.evaluateClaimById(ctx.tenantId, ctx.claimId);
  if (engine?.matched) {
    if (engine.claimDecision === "UNDER_REVIEW") return routeOut(ROUTE_CODES.PRICING_INCOMPLETE, `engine pended: ${engine.reasonCode ?? "line pended"}`);
    if (engine.claimDecision === "DECLINED") return routeOut(ROUTE_CODES.EXCLUSION_CONFIRMATION, `engine declines: ${engine.reasonCode ?? "excluded"}`);
    ctx.approveAmount = new Decimal(engine.totals.payable).toDecimalPlaces(2).toFixed();
    ctx.lines = engine.lines
      .filter((l) => !l.lineId.startsWith("case-rate") && !l.lineId.startsWith("package-") && !l.lineId.startsWith("proc-"))
      .map((l) => ({ claimLineId: l.lineId, payableAmount: new Decimal(l.payableAmount).toDecimalPlaces(2).toFixed(), billedAmount: "0" }));
  } else {
    const { ClaimDecisionService } = await import("@/server/services/claim-decision.service");
    const assessment = await ClaimDecisionService.assessCeiling(ctx.tenantId, ctx.claimId);
    if (!assessment.deterministic || assessment.ceiling == null) return routeOut(ROUTE_CODES.NO_CONTRACT, "no deterministic contract/tariff price");
    ctx.approveAmount = new Decimal(Math.min(Number(ctx.claim.billedAmount), assessment.ceiling)).toDecimalPlaces(2).toFixed();
  }
  if (!(Number(ctx.approveAmount) > 0)) return routeOut(ROUTE_CODES.PRICING_INCOMPLETE, "contract prices this claim at zero");
  return { disposition: "PASS", result: { approveAmount: ctx.approveAmount } };
}

async function stagePreauth(ctx: EvalContext): Promise<StageOutcome> {
  const PREAUTH_REQUIRED = ["INPATIENT", "SURGICAL", "MATERNITY"];
  if (!PREAUTH_REQUIRED.includes(ctx.claim.benefitCategory)) return PASS;
  const pa = await ctx.db.preAuthorization.findFirst({
    where: { tenantId: ctx.tenantId, memberId: ctx.claim.memberId, providerId: ctx.claim.providerId, benefitCategory: ctx.claim.benefitCategory as never, status: { in: ["APPROVED", "ATTACHED"] }, validUntil: { gte: new Date() } },
    select: { id: true },
  });
  if (!pa) return routeOut(ROUTE_CODES.PREAUTH_REQUIRED, "required pre-authorization missing/expired");
  return PASS;
}

async function stageBenefit(ctx: EvalContext): Promise<StageOutcome> {
  const { BenefitUsageService } = await import("@/server/services/benefit-usage.service");
  const cfg = await BenefitUsageService.resolveConfig(ctx.db, ctx.claim.memberId, ctx.claim.benefitCategory as never);
  if (!cfg) return routeOut(ROUTE_CODES.BENEFIT_NOT_CONFIGURED, "benefit not in member's package");
  const availability = await BenefitUsageService.computeAvailability(ctx.db, {
    memberId: ctx.claim.memberId,
    benefitCategory: ctx.claim.benefitCategory as never,
    requestedAmount: Number(ctx.approveAmount ?? ctx.claim.billedAmount),
    serviceDate: ctx.claim.dateOfService,
  });
  if (availability && Number(ctx.approveAmount ?? ctx.claim.billedAmount) > availability.payableCeiling + 0.01) {
    return routeOut(ROUTE_CODES.BENEFIT_LIMIT_REVIEW, `[${availability.reasonCode}] insufficient benefit availability`);
  }
  return PASS;
}

async function stageFraud(ctx: EvalContext): Promise<StageOutcome> {
  // Idempotent screening (step 6): ensure alerts are current, then gate on open ones.
  const { FraudService } = await import("@/server/services/fraud.service");
  await FraudService.evaluateClaim(ctx.claimId, ctx.tenantId).catch(() => undefined);
  const open = await ctx.db.claimFraudAlert.count({ where: { claimId: ctx.claimId, resolved: false } });
  if (open > 0) return routeOut(ROUTE_CODES.FRAUD_REVIEW, `${open} open fraud alert(s)`);
  return PASS;
}

// COST_SHARE preview is deepened in F4.4 (member/payer allocation).
const stageCostShare = async (): Promise<StageOutcome> => PASS;

async function stagePolicy(ctx: EvalContext): Promise<StageOutcome> {
  const p = ctx.policy;
  if (p.allowedSources.length > 0 && !p.allowedSources.includes(ctx.claim.source)) return routeOut(ROUTE_CODES.AUTO_POLICY_SCOPE_MISMATCH, `source ${ctx.claim.source} not in policy scope`);
  if (p.allowedServiceTypes.length > 0 && !p.allowedServiceTypes.includes(ctx.claim.serviceType)) return routeOut(ROUTE_CODES.AUTO_POLICY_SCOPE_MISMATCH, `service type ${ctx.claim.serviceType} not in policy scope`);
  if (p.allowedBenefitCategories.length > 0 && !p.allowedBenefitCategories.includes(ctx.claim.benefitCategory)) return routeOut(ROUTE_CODES.AUTO_POLICY_SCOPE_MISMATCH, `benefit ${ctx.claim.benefitCategory} not in policy scope`);

  // Ceiling (FX-normalised): payable vs the policy ceiling in base currency.
  const { FxService } = await import("@/server/services/fx.service");
  const ceiling = p.maxAutoApproveAmount == null ? null : Number(p.maxAutoApproveAmount);
  if (ceiling != null) {
    const claimNorm = await FxService.normalise(ctx.tenantId, Number(ctx.approveAmount ?? 0), ctx.claim.currency ?? "UGX");
    const ceilingNorm = await FxService.normalise(ctx.tenantId, ceiling, p.currency ?? "UGX");
    if ((claimNorm.identity && (ctx.claim.currency ?? "UGX") !== "UGX") || (ceilingNorm.identity && (p.currency ?? "UGX") !== "UGX")) {
      return routeOut(ROUTE_CODES.FX_RATE_MISSING, "no FX rate to compare against the policy ceiling");
    }
    if (claimNorm.baseAmount > ceilingNorm.baseAmount) return routeOut(ROUTE_CODES.ABOVE_AUTO_CEILING, "payable exceeds the policy ceiling");
  }
  return PASS;
}

interface StageDef {
  name: ClaimProcessingStageName;
  run: (ctx: EvalContext) => Promise<StageOutcome>;
}

const EVALUATION_STAGES: StageDef[] = [
  { name: "CONTEXT", run: stageContext },
  { name: "ELIGIBILITY", run: stageEligibility },
  { name: "CODING", run: stageCoding },
  { name: "DOCUMENTS", run: stageDocuments },
  { name: "DUPLICATE", run: stageDuplicate },
  { name: "CONTRACT", run: stageContract },
  { name: "PREAUTH", run: stagePreauth },
  { name: "BENEFIT", run: stageBenefit },
  { name: "FRAUD", run: stageFraud },
  { name: "COST_SHARE", run: stageCostShare },
  { name: "POLICY", run: stagePolicy },
];

async function loadClaim(db: Db, tenantId: string, claimId: string): Promise<LoadedClaim | null> {
  return db.claim.findUnique({
    where: { id: claimId, tenantId },
    select: {
      id: true, source: true, serviceType: true, benefitCategory: true, billedAmount: true, currency: true,
      memberId: true, providerId: true, dateOfService: true, invoiceNumber: true,
      member: { select: { status: true, group: { select: { status: true, clientId: true } } } },
      claimLines: { select: { id: true, cptCode: true, drugCode: true, icdCode: true, serviceCategory: true, billedAmount: true } },
    },
  }) as unknown as Promise<LoadedClaim | null>;
}

/**
 * Run the ordered read-only evaluation for a claim revision under its resolved
 * policy. Records each stage; stops at the first route and marks the rest
 * SKIPPED. `runId` optional — omit to evaluate without persisting stages.
 */
export async function evaluateClaimStaged(db: Db, tenantId: string, claimId: string, runId?: string): Promise<EvaluationResult> {
  const { AutoAdjudicationService } = await import("@/server/services/auto-adjudication.service");
  const claim = await loadClaim(db, tenantId, claimId);
  if (!claim) return { disposition: "ROUTE", mode: "OFF", routeCode: ROUTE_CODES.ELIGIBILITY_REVIEW, routeStage: "CONTEXT", reason: "claim not found", approveAmount: null, lines: [], policyId: null };

  const clientId = claim.member?.group?.clientId ?? null;
  const policyRow = await AutoAdjudicationService.resolvePolicy(tenantId, clientId);
  const mode: PolicyMode = policyRow ? effectivePolicyMode(policyRow as unknown as PolicyLike) : "OFF";

  if (mode === "OFF") {
    if (runId) {
      await recordStage(db, runId, "POLICY", { state: "ROUTED", reasonCode: policyRow ? ROUTE_CODES.AUTO_POLICY_OFF : ROUTE_CODES.AUTO_POLICY_NOT_LIVE, currentStage: true });
      for (const s of EVALUATION_STAGES) if (s.name !== "POLICY") await recordStage(db, runId, s.name, { state: "SKIPPED", reasonCode: "policy-off" });
    }
    return { disposition: "ROUTE", mode: "OFF", routeCode: policyRow ? ROUTE_CODES.AUTO_POLICY_OFF : ROUTE_CODES.AUTO_POLICY_NOT_LIVE, routeStage: "POLICY", reason: policyRow ? "automation not LIVE" : "no approved LIVE policy", approveAmount: null, lines: [], policyId: policyRow?.id ?? null };
  }

  const ctx: EvalContext = { db, tenantId, claimId, claim, policy: policyRow as never, mode, lines: [] };

  let routed = false;
  let routeInfo: { code: RouteCode; reason: string; stage: ClaimProcessingStageName } | null = null;
  for (const stage of EVALUATION_STAGES) {
    if (routed) {
      if (runId) await recordStage(db, runId, stage.name, { state: "SKIPPED", reasonCode: "earlier-route" });
      continue;
    }
    if (runId) await recordStage(db, runId, stage.name, { state: "RUNNING", currentStage: true });
    const t0 = Date.now();
    try {
      const outcome = await stage.run(ctx);
      const durationMs = Date.now() - t0;
      if (outcome.disposition === "ROUTE") {
        if (runId) await recordStage(db, runId, stage.name, { state: "ROUTED", reasonCode: outcome.code, safeMessage: outcome.reason, result: outcome.result as Prisma.InputJsonValue, durationMs });
        routed = true;
        routeInfo = { code: outcome.code, reason: outcome.reason, stage: stage.name };
      } else if (runId) {
        await recordStage(db, runId, stage.name, { state: "PASSED", result: outcome.result as Prisma.InputJsonValue, durationMs });
      }
    } catch (err) {
      if (runId) await recordStage(db, runId, stage.name, { state: "RETRYABLE", safeMessage: safeErrorMessage(err), durationMs: Date.now() - t0 });
      throw err; // the processor decides retry vs fail
    }
  }

  if (routed && routeInfo) {
    return { disposition: "ROUTE", mode, routeCode: routeInfo.code, routeStage: routeInfo.stage, reason: routeInfo.reason, approveAmount: ctx.approveAmount ?? null, lines: ctx.lines, policyId: ctx.policy.id };
  }
  return { disposition: mode === "LIVE" ? "APPROVE" : "WOULD_APPROVE", mode, routeCode: null, routeStage: null, reason: null, approveAmount: ctx.approveAmount ?? null, lines: ctx.lines, policyId: ctx.policy.id };
}
