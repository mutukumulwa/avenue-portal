import { prisma } from "@/lib/prisma";
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { TenantSettingsService } from "./tenant-settings.service";
import { ApprovalRequestService } from "./approval-request.service";
import { auditChainService } from "./audit-chain.service";

/**
 * claim-control.service.ts — money-control gates that sit in front of the
 * canonical claim decision (Outstanding-Conditions Ticket 2, OBS-7).
 *
 * OBS-7 fraud approval gate: a claim carrying an unresolved fraud alert at or
 * above the tenant's configured severity threshold cannot be finalised as
 * APPROVED / PARTIALLY_APPROVED until either
 *   (a) the fraud team clears the alert (resolved = true), or
 *   (b) — when the tenant permits dual approval — a fraud-clearance approval
 *       request completes in the Approvals console.
 *
 * The gate runs BEFORE any state-changing side effect (benefit usage, GL
 * journals, fund drawdown, settlement eligibility, member notifications), so a
 * blocked claim leaves no financial trace. Declines are always allowed — a
 * fraud alert must never stop an operator from rejecting a claim.
 *
 * The dual-approval request is filed under a dedicated entityType
 * ("ClaimFraudClearance") so it can never be confused with — or consumed by —
 * the value-approval CLAIM_PAYMENT chain the matrix runs on entityType
 * "Claim". Alert clearance remains the guaranteed satisfaction path; the
 * dual-approval request is a best-effort convenience that only materialises
 * when the tenant has a matching approval matrix rule.
 */

export const FRAUD_CLEARANCE_ENTITY = "ClaimFraudClearance";

export interface FraudGateContext {
  claimId: string;
  claimNumber: string;
  currency: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  action: "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";
  approvedAmount: number;
  clientId: string | null;
  reviewerId: string;
}

export class ClaimControlService {
  /**
   * Enforce the OBS-7 fraud approval gate. Returns normally when the claim may
   * proceed; throws an operator-readable Error when it must be blocked.
   */
  static async enforceFraudGate(tenantId: string, ctx: FraudGateContext): Promise<void> {
    // Declines are never gated.
    if (ctx.action === "DECLINED") return;

    const settings = await TenantSettingsService.getClaimControls(tenantId);
    if (!settings.requireFraudClearanceBeforeApproval) return;

    const alerts = await prisma.claimFraudAlert.findMany({
      where: { tenantId, claimId: ctx.claimId, resolved: false },
      select: { id: true, severity: true, rule: true },
    });
    const blocking = alerts.filter((a) =>
      TenantSettingsService.severityAtLeast(a.severity, settings.fraudApprovalSeverityThreshold),
    );
    if (blocking.length === 0) return; // no unresolved alert at/above threshold

    const dualAllowed = settings.fraudApprovalGateMode === "CLEAR_ALERT_OR_DUAL_APPROVAL";

    // Satisfaction path (b): a completed, not-yet-applied fraud-clearance
    // approval consumes the gate exactly once.
    if (dualAllowed) {
      const cleared = await prisma.approvalRequest.findFirst({
        where: {
          tenantId,
          entityType: FRAUD_CLEARANCE_ENTITY,
          entityId: ctx.claimId,
          status: "APPROVED",
          appliedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (cleared) {
        await prisma.approvalRequest.update({
          where: { id: cleared.id },
          data: { appliedAt: new Date() },
        });
        await auditChainService
          .append({
            actorId: ctx.reviewerId,
            action: "CLAIM:FRAUD_GATE_CLEARED_BY_APPROVAL",
            module: "FRAUD",
            entityType: "Claim",
            entityId: ctx.claimId,
            payload: { alertIds: blocking.map((a) => a.id), approvalRequestId: cleared.id },
            tenantId,
            description: `Claim ${ctx.claimNumber} fraud gate satisfied by a completed dual-approval request.`,
          })
          .catch(() => undefined);
        return; // gate satisfied
      }
    }

    // Gate is blocking. When dual approval is permitted, open (or reuse) a
    // routing request so ops can action it in the Approvals console. This is
    // best-effort: if the tenant has no CLAIM_PAYMENT matrix rule, no request
    // is created and clearing the alert is the only path.
    if (dualAllowed) {
      const existing = await prisma.approvalRequest.findFirst({
        where: {
          tenantId,
          entityType: FRAUD_CLEARANCE_ENTITY,
          entityId: ctx.claimId,
          status: { in: ["PENDING", "ESCALATED"] },
        },
        select: { id: true },
      });
      if (!existing) {
        await ApprovalRequestService.create(tenantId, {
          actionType: "CLAIM_PAYMENT",
          entityType: FRAUD_CLEARANCE_ENTITY,
          entityId: ctx.claimId,
          makerId: ctx.reviewerId,
          clientId: ctx.clientId,
          amount: ctx.approvedAmount,
          currency: ctx.currency,
          serviceType: ctx.serviceType,
          benefitCategory: ctx.benefitCategory,
          payload: {
            reason: "FRAUD_ALERT_CLEARANCE",
            claimNumber: ctx.claimNumber,
            alertIds: blocking.map((a) => a.id),
          },
        }).catch(() => null);
      }
    }

    await auditChainService
      .append({
        actorId: ctx.reviewerId,
        action: "CLAIM:FRAUD_GATE_BLOCKED",
        module: "FRAUD",
        entityType: "Claim",
        entityId: ctx.claimId,
        payload: {
          alertIds: blocking.map((a) => a.id),
          rules: blocking.map((a) => a.rule),
          threshold: settings.fraudApprovalSeverityThreshold,
          mode: settings.fraudApprovalGateMode,
        },
        tenantId,
        description: `Claim ${ctx.claimNumber} approval blocked — ${blocking.length} unresolved fraud alert(s) at/above ${settings.fraudApprovalSeverityThreshold}.`,
      })
      .catch(() => undefined);

    const rules = Array.from(new Set(blocking.map((a) => a.rule))).join(", ");
    const clearancePath = dualAllowed
      ? "clear the alert(s) in the Fraud console, or complete the fraud-clearance approval in Approvals"
      : "clear the alert(s) in the Fraud console";
    throw new Error(
      `Fraud control: this claim has ${blocking.length} unresolved fraud alert(s) at or above ` +
        `${settings.fraudApprovalSeverityThreshold} severity (${rules}). It cannot be approved until you ${clearancePath}.`,
    );
  }
}
