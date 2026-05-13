"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { lifecycleService } from "@/server/services/lifecycle.service";
import { revalidatePath } from "next/cache";

export async function lapseManuallyAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await lifecycleService.lapseMembership(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function reinstateWithinCatchupAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await lifecycleService.reinstateWithinCatchup(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function initiateCoolingOffCancellationAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await lifecycleService.initiateCoolingOffCancellation(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function initiateStandardCancellationAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await lifecycleService.initiateStandardCancellation(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}`);
}

export async function terminateForFraudAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const memberId   = formData.get("memberId") as string;
  const reasonCode = formData.get("reasonCode") as string;
  const narrative  = (formData.get("narrative") as string) || undefined;
  await lifecycleService.terminateForFraud(memberId, session.user.tenantId, session.user.id, reasonCode, narrative);
  revalidatePath(`/members/${memberId}`);
}

export async function terminateForBreachAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId   = formData.get("memberId") as string;
  const reasonCode = formData.get("reasonCode") as string;
  const narrative  = (formData.get("narrative") as string) || undefined;
  await lifecycleService.terminateForBreach(memberId, session.user.tenantId, session.user.id, reasonCode, narrative);
  revalidatePath(`/members/${memberId}`);
}

export async function recordDeathAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId    = formData.get("memberId") as string;
  const proofDocUrl = formData.get("proofDocUrl") as string;
  await lifecycleService.recordPrincipalDeath(memberId, session.user.tenantId, session.user.id, proofDocUrl);
  revalidatePath(`/members/${memberId}`);
}
