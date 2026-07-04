"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { revalidatePath } from "next/cache";

export async function runAutoDecisionAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const preAuthId = formData.get("preAuthId") as string;
  await preauthAdjudicationService.executeAutoDecision(preAuthId, session.user.tenantId, session.user.id);
  revalidatePath(`/preauth/${preAuthId}`);
}

// W1.1: approveByHumanAction / declineByHumanAction removed — the single PA
// decision surface is PreAuthAdjudicationForm → adjudicatePreAuthAction
// (./actions.ts), which delegates to the same canonical service.

export async function releaseBenefitHoldAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const preAuthId = formData.get("preAuthId") as string;
  await preauthAdjudicationService.releaseBenefitHold(preAuthId, session.user.tenantId);
  revalidatePath(`/preauth/${preAuthId}`);
}

export async function cancelPreAuthAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const preAuthId = formData.get("preAuthId") as string;
  const reason    = formData.get("reason") as string;
  await preauthAdjudicationService.cancelPreAuth(preAuthId, session.user.tenantId, session.user.id, reason);
  revalidatePath(`/preauth/${preAuthId}`);
}
