import { prisma } from "@/lib/prisma";
import { claimAdjudicationService } from "./claim-adjudication.service";

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
}
