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

export async function computeOutcomeAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId = formData.get("claimId") as string;
  await claimAdjudicationService.computeClaimOutcome(claimId, session.user.tenantId);
  revalidatePath(`/claims/${claimId}`);
}

export async function approveClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId = formData.get("claimId") as string;
  await claimAdjudicationService.approveClaim(claimId, session.user.tenantId, session.user.id);
  revalidatePath(`/claims/${claimId}`);
}

export async function approveSeniorClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const claimId = formData.get("claimId") as string;
  await claimAdjudicationService.approveSenior(claimId, session.user.tenantId, session.user.id);
  revalidatePath(`/claims/${claimId}`);
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
