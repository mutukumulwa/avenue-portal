import { prisma } from "@/lib/prisma";
import { claimAdjudicationService } from "./claim-adjudication.service";
import { DrugExclusionService } from "./drug-exclusion.service";
import { ClaimsService } from "./claims.service";
import { auditChainService } from "./audit-chain.service";

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
}

// Fallback when no policy is configured: conservative — auto-approve clean
// claims with no fraud flag and no ceiling.
const DEFAULT = { enabled: true, maxAutoApproveAmount: null as number | null, requireCleanFraud: true };

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
        member: { select: { group: { select: { clientId: true } } } },
      },
    });
    if (!claim) return { decision: "ROUTE", failingGate: "CLAIM_NOT_FOUND", reason: "Claim not found", policyId: null };

    const clientId = claim.member?.group?.clientId ?? null;
    const policyRow = await this.resolvePolicy(tenantId, clientId);
    const policy = policyRow ?? DEFAULT;
    const policyId = policyRow?.id ?? null;

    if (!policy.enabled) {
      return { decision: "ROUTE", failingGate: "AUTO_ADJ_DISABLED", reason: "Auto-adjudication is disabled for this client", policyId };
    }

    // Deterministic hard gates (dup invoice, double-capture, temporal, cover).
    const gates = await claimAdjudicationService.runHardGateValidation(tenantId, {
      providerId: claim.providerId,
      memberId: claim.memberId,
      dateOfService: claim.dateOfService,
      benefitCategory: claim.benefitCategory,
      invoiceNumber: claim.invoiceNumber ?? undefined,
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

    // Within the auto-approve ceiling.
    const ceiling = policy.maxAutoApproveAmount != null ? Number(policy.maxAutoApproveAmount) : null;
    if (ceiling != null && Number(claim.billedAmount) > ceiling) {
      return {
        decision: "ROUTE",
        failingGate: "ABOVE_CEILING",
        reason: `Billed ${Number(claim.billedAmount)} exceeds auto-approve ceiling ${ceiling}`,
        policyId,
      };
    }

    return { decision: "AUTO_APPROVE", reason: "All gates passed within policy", policyId };
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

      // AUTO_APPROVE — approve the payable lines at billed, then execute the
      // claim-level approval through the standard machinery.
      const undecided = await prisma.claimLine.findMany({
        where: { claimId, adjudicationDecision: null },
        select: { id: true, billedAmount: true },
      });
      for (const line of undecided) {
        await prisma.claimLine.update({
          where: { id: line.id },
          data: { adjudicationDecision: "APPROVED", approvedAmount: line.billedAmount },
        });
      }

      const approvedAmount =
        claim.claimLines.length > 0 ? exclusions.payableAmount : Number(claim.billedAmount);
      const action = exclusions.excludedCount > 0 ? ("PARTIALLY_APPROVED" as const) : ("APPROVED" as const);

      await ClaimsService.adjudicateClaim(tenantId, claimId, {
        action,
        approvedAmount,
        reviewerId: actorId,
        notes: `Auto-adjudicated (policy ${result.policyId ?? "built-in default"})${
          exclusions.excludedCount > 0 ? ` — ${exclusions.excludedCount} excluded-drug line(s) declined` : ""
        }`,
      });

      await auditChainService.append({
        actorId,
        action: "CLAIM:AUTO_APPROVED",
        module: "CLAIM",
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
