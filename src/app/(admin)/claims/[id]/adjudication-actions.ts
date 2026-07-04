"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";
import { ClaimLineDecision } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function adjudicateLineAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId     = formData.get("claimId") as string;
  const claimLineId = formData.get("claimLineId") as string;
  const decision    = formData.get("decision") as ClaimLineDecision;
  const adjustedAmt = formData.get("adjustedAmount") ? Number(formData.get("adjustedAmount")) : undefined;
  const adjReason   = (formData.get("adjustmentReason") as string) || undefined;
  const decReason   = (formData.get("declineReason") as string) || undefined;

  await claimAdjudicationService.adjudicateLineItem(
    claimLineId, session.user.tenantId, session.user.id, decision,
    { adjustedAmount: adjustedAmt, adjustmentReason: adjReason, declineReason: decReason },
  );
  revalidatePath(`/claims/${claimId}`);
}

/**
 * W1.1: preview-only — computes what the line decisions imply; the actual
 * decision (with matrix, ceiling, usage, holds, GL) is the single "Submit
 * Decision" form → ClaimDecisionService.decide. The former
 * approveClaimAction / approveSeniorClaimAction (the unguarded duplicate
 * stack) are retired.
 */
export async function computeOutcomeAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId = formData.get("claimId") as string;
  const { outcome, netApprovedAmount } = await claimAdjudicationService.computeClaimOutcome(
    claimId, session.user.tenantId,
  );
  const { redirect } = await import("next/navigation");
  redirect(
    `/claims/${claimId}?notice=${encodeURIComponent(
      `Line-decision preview: ${outcome.replace(/_/g, " ")} at ${netApprovedAmount.toLocaleString()} — submit it through the decision form below.`,
    )}`,
  );
}

export async function initiateAppealAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId  = formData.get("claimId") as string;
  const notes    = formData.get("appealNotes") as string;
  await claimAdjudicationService.initiateAppeal(
    claimId, session.user.tenantId, notes, session.user.id,
  );
  revalidatePath(`/claims/${claimId}`);
}

export async function computeVarianceAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId = formData.get("claimId") as string;
  await claimAdjudicationService.computeContractedRateVariance(claimId, session.user.tenantId);
  revalidatePath(`/claims/${claimId}`);
}
