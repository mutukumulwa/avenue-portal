"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { bindingService } from "@/server/services/binding.service";
import { AcceptanceMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function acceptQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const method = (formData.get("method") as AcceptanceMethod) || "PORTAL_CLICK";
  const documentUrl = (formData.get("documentUrl") as string) || undefined;

  await bindingService.captureAcceptance(
    quotationId, session.user.tenantId,
    method, session.user.id,
    documentUrl || undefined,
  );
  revalidatePath(`/quotations/${quotationId}`);
}

export async function createMembershipsAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await bindingService.createMemberships(quotationId, session.user.tenantId, session.user.id);
  revalidatePath(`/quotations/${quotationId}`);
}

export async function approveBinderAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await bindingService.approveBinder(quotationId, session.user.tenantId, session.user.id);
  revalidatePath(`/quotations/${quotationId}`);
}

export async function postDebitNoteAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await bindingService.postDebitNote(quotationId, session.user.tenantId, session.user.id);
  revalidatePath(`/quotations/${quotationId}`);
}
