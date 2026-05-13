"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { amendmentService } from "@/server/services/amendment.service";
import { revalidatePath } from "next/cache";

export async function computeProRataAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.computeProRata(endorsementId, session.user.tenantId);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function submitAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.submitForApproval(endorsementId, session.user.tenantId, session.user.id);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function approveAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const endorsementId = formData.get("endorsementId") as string;
  const notes = (formData.get("notes") as string) || undefined;
  await amendmentService.approveAmendment(endorsementId, session.user.tenantId, session.user.id, notes);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function applyAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const endorsementId = formData.get("endorsementId") as string;
  await amendmentService.applyAmendment(endorsementId, session.user.tenantId, session.user.id);
  revalidatePath(`/endorsements/${endorsementId}`);
}

export async function rejectAmendmentAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const endorsementId = formData.get("endorsementId") as string;
  const reason = formData.get("reason") as string;
  await amendmentService.rejectAmendment(endorsementId, session.user.tenantId, session.user.id, reason);
  revalidatePath(`/endorsements/${endorsementId}`);
}
