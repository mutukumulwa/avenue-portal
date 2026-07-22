/**
 * Claims Autopilot — governed policy change application (F2.5, D15).
 *
 * Creating/activating a LIVE (or any) policy version is a governed money-control
 * change routed through the existing maker-checker infrastructure
 * (`ApprovalRequestService`) under the new `AUTO_ADJ_POLICY_CHANGE` action:
 *   - `submitPolicyChange` moves a DRAFT/REJECTED policy to PENDING_APPROVAL and
 *     opens an approval request carrying a SAFE payload (id/version/mode/ceiling/
 *     scope) — never raw form state.
 *   - `applyApprovedPolicyChange` runs ONLY from the approval dispatch when the
 *     chain reaches APPROVED; it activates the version and supersedes the prior
 *     approved version in the same scope. Idempotent (replay-safe) and enforces
 *     maker ≠ checker as defence in depth (the chain already enforces SoD).
 *   - `deactivatePolicy` is immediate and reason-required for safety.
 */
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";
import { ApprovalRequestService } from "../approval-request.service";

export interface PolicyChangePayload {
  policyId: string;
  version: number;
  mode: string;
  ceiling: string | null; // decimal string in policy currency
  currency: string;
  clientId: string | null;
}

interface PolicyRow {
  id: string;
  clientId: string | null;
  version: number;
  mode: string;
  status: string;
  currency: string;
  createdById: string | null;
  maxAutoApproveAmount: { toString(): string } | null;
}

/** Safe approval payload — identity + scope, not the raw editable form. */
export function buildPolicyChangePayload(policy: PolicyRow): PolicyChangePayload {
  return {
    policyId: policy.id,
    version: policy.version,
    mode: policy.mode,
    ceiling: policy.maxAutoApproveAmount == null ? null : policy.maxAutoApproveAmount.toString(),
    currency: policy.currency,
    clientId: policy.clientId,
  };
}

/**
 * Open a governed approval for a policy change. Returns the approval request id.
 * The policy is not active until the chain completes and applies it.
 */
export async function submitPolicyChange(
  tenantId: string,
  policyId: string,
  makerId: string,
): Promise<{ requestId: string }> {
  const policy = (await prisma.autoAdjudicationPolicy.findFirst({ where: { id: policyId, tenantId } })) as PolicyRow | null;
  if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found." });
  if (policy.status !== "DRAFT" && policy.status !== "REJECTED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Only a DRAFT or REJECTED policy can be submitted (this one is ${policy.status}).` });
  }

  const request = await ApprovalRequestService.create(tenantId, {
    actionType: "AUTO_ADJ_POLICY_CHANGE",
    entityType: "AutoAdjudicationPolicy",
    entityId: policyId,
    makerId,
    clientId: policy.clientId,
    amount: null,
    currency: policy.currency,
    payload: buildPolicyChangePayload(policy) as unknown as Record<string, unknown>,
  });
  if (!request) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No approval matrix is configured for AUTO_ADJ_POLICY_CHANGE — configure one before submitting policy changes.",
    });
  }

  await prisma.autoAdjudicationPolicy.update({
    where: { id: policyId },
    data: { status: "PENDING_APPROVAL", approvalRequestId: request.id, createdById: policy.createdById ?? makerId },
  });
  return { requestId: request.id };
}

/**
 * Activate an approved policy version. Called by the approval dispatch on final
 * APPROVED. Idempotent; supersedes the prior approved version in the same scope.
 */
export async function applyApprovedPolicyChange(tenantId: string, policyId: string, checkerId: string): Promise<void> {
  const policy = (await prisma.autoAdjudicationPolicy.findFirst({ where: { id: policyId, tenantId } })) as PolicyRow | null;
  if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found." });
  // Defence in depth (the approval chain already enforces SoD).
  if (policy.createdById && policy.createdById === checkerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "The maker cannot approve their own policy." });
  }
  if (policy.status === "APPROVED") return; // replay-safe: already active

  await prisma.$transaction([
    // Supersede the prior approved version in the same client scope.
    prisma.autoAdjudicationPolicy.updateMany({
      where: { tenantId, clientId: policy.clientId, id: { not: policyId }, status: "APPROVED" },
      data: { status: "SUPERSEDED" },
    }),
    // Activate this version only if it is not already approved (conditional ⇒ idempotent under races).
    prisma.autoAdjudicationPolicy.updateMany({
      where: { id: policyId, status: { not: "APPROVED" } },
      data: { status: "APPROVED", approvedById: checkerId, approvedAt: new Date() },
    }),
  ]);
}

/** Immediate, reason-required deactivation (safety — D15). */
export async function deactivatePolicy(tenantId: string, policyId: string, actorId: string, reason: string): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A deactivation reason is required." });
  }
  const res = await prisma.autoAdjudicationPolicy.updateMany({
    where: { id: policyId, tenantId },
    data: { status: "DEACTIVATED", deactivatedById: actorId, deactivationReason: reason.trim() },
  });
  if (res.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found." });
}
