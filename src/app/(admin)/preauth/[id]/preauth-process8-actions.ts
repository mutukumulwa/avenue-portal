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

export async function approveByHumanAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const preAuthId      = formData.get("preAuthId") as string;
  const approvedAmount = Number(formData.get("approvedAmount"));
  const notes          = (formData.get("notes") as string) || undefined;
  await preauthAdjudicationService.approveByHuman(preAuthId, session.user.tenantId, session.user.id, approvedAmount, notes);
  revalidatePath(`/preauth/${preAuthId}`);
}

export async function declineByHumanAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);
  const preAuthId  = formData.get("preAuthId") as string;
  const reasonCode = formData.get("reasonCode") as string;
  const notes      = formData.get("notes") as string;
  await preauthAdjudicationService.declineByHuman(preAuthId, session.user.tenantId, session.user.id, reasonCode, notes);
  revalidatePath(`/preauth/${preAuthId}`);
}

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
