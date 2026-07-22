import { prisma } from "@/lib/prisma";
import { claimAdjudicationService } from "./claim-adjudication.service";
import { DrugExclusionService } from "./drug-exclusion.service";
import { ClaimDecisionService } from "./claim-decision.service";
import { auditChainService } from "./audit-chain.service";
import { ContractEngine } from "./contract-engine/engine";
import { ContractEngineIntegration } from "./contract-engine/persist";
import { effectivePolicyMode, type PolicyLike } from "./claim-autopilot/policy";

// Digital-contract engine gates (spec §8.3): a claim the engine cannot fully
// price/match ROUTES with a named contract gate, and auto-approval executes at
// the ENGINE-PRICED amount — never blindly at billed (PR-021). Default ON;
// CONTRACT_ENGINE_GATES=0 opts out for non-production sandboxes only.
const CONTRACT_ENGINE_GATES = process.env.CONTRACT_ENGINE_GATES !== "0";

/**
 * Auto-adjudication (Medvex spec §3.7 / gap G3.7). Clean, low-risk claims that
 * pass every deterministic gate — and sit within the client's configured,
 * versioned policy — auto-approve without a human touch. Everything else ROUTES
 * to review with the *failing gate named*, and is explainable/audit-chainable.
 *
 * AI-assisted checks (when added) augment but never silently override this; a
 * routed claim always names why.
 */

export interface AutoAdjResult {
  decision: "AUTO_APPROVE" | "ROUTE";
  failingGate?: string;
  reason: string;
  policyId: string | null;
  /**
   * PR-021: the contract-constrained amount an AUTO_APPROVE must execute at
   * (engine payable, or billed capped to the enforceable ceiling). Never the
   * raw billed amount when a pricing source exists.
   */
  approveAmount?: number;
  /** Per-line engine payables for line stamping (real ClaimLine ids only). */
  linePayables?: Map<string, number>;
}

export class AutoAdjudicationService {
  /** Resolve the governing policy: client-specific active wins, else operator default. */
  static async resolvePolicy(tenantId: string, clientId?: string | null) {
    const now = new Date();
    const rows = await prisma.autoAdjudicationPolicy.findMany({
      where: {
        tenantId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        AND: [{ OR: [{ clientId: clientId ?? null }, { clientId: null }] }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return rows.find((r) => r.clientId === (clientId ?? null)) ?? rows.find((r) => r.clientId === null) ?? null;
  }

  /**
   * Decide whether a claim can auto-approve. Returns a structured result naming
   * the failing gate when it routes.
   */
  static async evaluateClaim(tenantId: string, claimId: string): Promise<AutoAdjResult> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        providerId: true,
        memberId: true,
        dateOfService: true,
        benefitCategory: true,
        invoiceNumber: true,
        billedAmount: true,
        currency: true,
        member: { select: { group: { select: { clientId: true } } } },
      },
    });
    if (!claim) return { decision: "ROUTE", failingGate: "CLAIM_NOT_FOUND", reason: "Claim not found", policyId: null };

    const clientId = claim.member?.group?.clientId ?? null;
    const policyRow = await this.resolvePolicy(tenantId, clientId);

    // ── D1: no implicit live automation ───────────────────────────────────────
    // A claim may auto-decide ONLY under an approved LIVE policy that resolves for
    // its client. No policy (or an OFF/SHADOW/unapproved one) is NEVER permission
    // to move money — the claim routes to a human. The old built-in fallback
    // (enabled:true, no ceiling) is removed; there is no production bypass.
    if (!policyRow || effectivePolicyMode(policyRow as unknown as PolicyLike) !== "LIVE") {
      return {
        decision: "ROUTE",
        failingGate: policyRow ? "AUTO_POLICY_OFF" : "AUTO_POLICY_NOT_LIVE",
        reason: policyRow
          ? "Automation is not LIVE for this client — claim routes to review"
          : "No approved LIVE policy — claim routes to review",
        policyId: policyRow?.id ?? null,
      };
    }
    const policy = policyRow;
    const policyId = policy.id;

    // Deterministic hard gates (dup invoice, double-capture, temporal, cover).
    // The claim under evaluation is excluded so it never flags itself (PR-012).
    const gates = await claimAdjudicationService.runHardGateValidation(tenantId, {
      providerId: claim.providerId,
      memberId: claim.memberId,
      dateOfService: claim.dateOfService,
      benefitCategory: claim.benefitCategory,
      invoiceNumber: claim.invoiceNumber ?? undefined,
      excludeClaimId: claimId,
    });
    if (!gates.passed) {
      return { decision: "ROUTE", failingGate: gates.errors[0] ?? "HARD_GATE", reason: gates.errors.join("; "), policyId };
    }

    // No open fraud flag.
    if (policy.requireCleanFraud) {
      const openAlerts = await prisma.claimFraudAlert.count({ where: { claimId, resolved: false } });
      if (openAlerts > 0) {
        return { decision: "ROUTE", failingGate: "FRAUD_FLAG", reason: `${openAlerts} open fraud alert(s)`, policyId };
      }
    }

    // ── PR-021: contract-constrained pricing gate ─────────────────────────
    // Auto-approval must execute at a deterministic contract/tariff price,
    // never blindly at billed. The engine verdict decides:
    //   matched + fully priced      → approve at the engine's payable
    //   matched + UNDER_REVIEW      → ROUTE (a line pended — human prices it)
    //   matched + DECLINED          → ROUTE (a human confirms declines)
    //   unmatched                   → billed capped to the FFS tariff ceiling;
    //                                 no enforceable price at all → ROUTE.
    let approveAmount = Number(claim.billedAmount);
    let linePayables: Map<string, number> | undefined;
    if (CONTRACT_ENGINE_GATES) {
      const engine = await ContractEngine.evaluateClaimById(tenantId, claimId);
      if (engine?.matched) {
        if (engine.claimDecision === "UNDER_REVIEW") {
          const firstPend = engine.lines.find(l => l.decision === "PENDED");
          return { decision: "ROUTE", failingGate: "PRICING_COMPLETE", reason: `Engine could not fully price: ${firstPend?.reasonCode ?? engine.reasonCode ?? "line pended"}`, policyId };
        }
        if (engine.claimDecision === "DECLINED") {
          return { decision: "ROUTE", failingGate: "ENGINE_DECLINED", reason: `Contract engine declines this claim (${engine.reasonCode ?? "all lines excluded/rejected"}) — route for human confirmation`, policyId };
        }
        approveAmount = engine.totals.payable;
        linePayables = new Map(engine.lines.filter(l => !l.lineId.startsWith("case-rate") && !l.lineId.startsWith("package-") && !l.lineId.startsWith("proc-")).map(l => [l.lineId, l.payableAmount]));
      } else {
        const { ClaimDecisionService } = await import("./claim-decision.service");
        const assessment = await ClaimDecisionService.assessCeiling(tenantId, claimId);
        if (!assessment.deterministic || assessment.ceiling == null) {
          return {
            decision: "ROUTE",
            failingGate: "NO_ENFORCEABLE_PRICE",
            reason: "No contract or tariff prices this claim deterministically — reviewer judgement required",
            policyId,
          };
        }
        approveAmount = Math.min(Number(claim.billedAmount), assessment.ceiling);
      }
      if (!(approveAmount > 0)) {
        return { decision: "ROUTE", failingGate: "ZERO_PAYABLE", reason: "Contract prices this claim at zero — route for human review", policyId };
      }
    }

    // Within the auto-approve ceiling — FX-normalised (PR-017 boundary sweep):
    // the policy ceiling is denominated in the policy's currency (seed default
    // UGX) while claims may carry KES; both sides convert to base before the
    // comparison. A missing rate fails safe (routes). The comparison runs on
    // the amount that would actually be approved (PR-021).
    const ceiling = policy.maxAutoApproveAmount != null ? Number(policy.maxAutoApproveAmount) : null;
    if (ceiling != null) {
      const { FxService } = await import("./fx.service");
      const policyCurrency = (policyRow?.currency as string | undefined) ?? "UGX";
      const claimNorm = await FxService.normalise(tenantId, approveAmount, claim.currency ?? "UGX");
      const ceilingNorm = await FxService.normalise(tenantId, ceiling, policyCurrency);
      const claimFxMissing = claimNorm.identity && (claim.currency ?? "UGX") !== "UGX";
      const ceilingFxMissing = ceilingNorm.identity && policyCurrency !== "UGX";
      if (claimFxMissing || ceilingFxMissing) {
        return {
          decision: "ROUTE",
          failingGate: "FX_RATE_MISSING",
          reason: `No FX rate in force to compare ${claim.currency} claim against ${policyCurrency} ceiling — fail-safe route`,
          policyId,
        };
      }
      if (claimNorm.baseAmount > ceilingNorm.baseAmount) {
        return {
          decision: "ROUTE",
          failingGate: "ABOVE_CEILING",
          reason: `Payable ${claim.currency} ${approveAmount.toLocaleString()} (≈ UGX ${Math.round(claimNorm.baseAmount).toLocaleString()}) exceeds auto-approve ceiling ${policyCurrency} ${ceiling.toLocaleString()}`,
          policyId,
        };
      }
    }

    return { decision: "AUTO_APPROVE", reason: "All gates passed within policy", policyId, approveAmount, linePayables };
  }

  /**
   * Intake pipeline (G3.7 execution + G9.5 enforcement). Runs at claim receipt:
   * 1. Drug exclusions — DECLINE excluded lines with the reason on the line.
   * 2. Evaluate auto-adjudication (reimbursements always route: proof docs
   *    need human eyes).
   * 3. AUTO_APPROVE → executes the approval through the standard adjudication
   *    machinery (tariff stamping, benefit reservation, cost-share, logs);
   *    ROUTE → records the named failing gate on the claim + adjudication log.
   * Never throws — an intake pipeline failure must not lose the claim; it
   * routes to manual review instead.
   */
  static async processIntake(
    tenantId: string,
    claimId: string,
    actorId: string,
  ): Promise<AutoAdjResult & { executed: boolean }> {
    try {
      const exclusions = await DrugExclusionService.applyToClaim(tenantId, claimId);

      const claim = await prisma.claim.findUnique({
        where: { id: claimId, tenantId },
        select: { isReimbursement: true, billedAmount: true, claimNumber: true, status: true, claimLines: { select: { id: true } } },
      });
      if (!claim) return { decision: "ROUTE", failingGate: "CLAIM_NOT_FOUND", reason: "Claim not found", policyId: null, executed: false };

      let result: AutoAdjResult;
      if (claim.isReimbursement) {
        result = {
          decision: "ROUTE",
          failingGate: "REIMBURSEMENT_MANUAL_REVIEW",
          reason: "Reimbursement claims require manual proof-of-payment verification",
          policyId: null,
        };
      } else if (exclusions.excludedCount > 0 && exclusions.payableAmount === 0) {
        result = {
          decision: "ROUTE",
          failingGate: "ALL_LINES_EXCLUDED",
          reason: `All ${exclusions.excludedCount} line(s) carry excluded drugs`,
          policyId: null,
        };
      } else {
        result = await this.evaluateClaim(tenantId, claimId);
      }

      await prisma.claim.update({
        where: { id: claimId },
        data: {
          autoAdjDecision: result.decision,
          autoAdjFailingGate: result.failingGate ?? null,
          autoAdjPolicyId: result.policyId,
          autoAdjudicatedAt: new Date(),
        },
      });

      // Stamp digital-contract engine provenance on the claim + lines (spec §8.3).
      // Non-fatal: a provenance-write failure must not affect the claim.
      await ContractEngineIntegration.evaluateAndPersist(tenantId, claimId);

      if (result.decision === "ROUTE") {
        await prisma.adjudicationLog.create({
          data: {
            claimId,
            userId: actorId,
            action: "ROUTED",
            fromStatus: claim.status,
            toStatus: claim.status,
            notes: `Routed to manual review — ${result.failingGate}: ${result.reason}`,
          },
        });
        return { ...result, executed: false };
      }

      // AUTO_APPROVE — stamp lines at the ENGINE-PRICED payable when the
      // contract engine priced them (PR-021), else at billed, then execute the
      // claim-level approval through the standard machinery.
      const undecided = await prisma.claimLine.findMany({
        where: { claimId, adjudicationDecision: null },
        select: { id: true, billedAmount: true },
      });
      for (const line of undecided) {
        const payable = result.linePayables?.get(line.id);
        await prisma.claimLine.update({
          where: { id: line.id },
          data: { adjudicationDecision: "APPROVED", approvedAmount: payable ?? line.billedAmount },
        });
      }

      // PR-021: the executed amount is the contract-constrained approveAmount;
      // excluded-drug adjustments can only reduce it further.
      const priceCapped = result.approveAmount ?? Number(claim.billedAmount);
      const approvedAmount =
        claim.claimLines.length > 0 && exclusions.excludedCount > 0
          ? Math.min(priceCapped, exclusions.payableAmount)
          : priceCapped;
      const action =
        exclusions.excludedCount > 0 || approvedAmount < Number(claim.billedAmount) - 0.01
          ? ("PARTIALLY_APPROVED" as const)
          : ("APPROVED" as const);

      // W1.1: auto-approval executes through the canonical decision stack so
      // usage/holds/GL side-effects are identical to a human decision.
      // systemDecision skips the matrix role-gate — the policy gates above are
      // the auto path's authorisation; matrix-banded claims exceed the policy
      // ceiling and route to humans anyway.
      await ClaimDecisionService.decide(tenantId, claimId, {
        action,
        approvedAmount,
        reviewerId: actorId,
        systemDecision: true,
        notes: `Auto-adjudicated (policy ${result.policyId ?? "built-in default"})${
          exclusions.excludedCount > 0 ? ` — ${exclusions.excludedCount} excluded-drug line(s) declined` : ""
        }`,
      });

      await auditChainService.append({
        actorId,
        action: "CLAIM:AUTO_APPROVED",
        module: "CLAIMS",
        entityType: "Claim",
        entityId: claimId,
        payload: { approvedAmount, policyId: result.policyId, excludedLines: exclusions.excludedCount },
        tenantId,
        description: `Claim ${claim.claimNumber} auto-approved — ${approvedAmount.toLocaleString("en-UG")} (policy ${result.policyId ?? "default"})`,
      });

      return { ...result, executed: true };
    } catch (err) {
      // Fail-safe: never lose the claim; leave it for manual review.
      const reason = err instanceof Error ? err.message : String(err);
      await prisma.claim
        .update({
          where: { id: claimId },
          data: { autoAdjDecision: "ROUTE", autoAdjFailingGate: "PIPELINE_ERROR", autoAdjudicatedAt: new Date() },
        })
        .catch(() => undefined);
      return { decision: "ROUTE", failingGate: "PIPELINE_ERROR", reason, policyId: null, executed: false };
    }
  }
}
