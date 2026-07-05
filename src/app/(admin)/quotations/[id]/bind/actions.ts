"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { bindingService } from "@/server/services/binding.service";
import { AcceptanceMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * PR-037: every bind step surfaces failures as a banner on the bind page —
 * a maker-checker wizard must never dead-end in a raw application error.
 */
async function runBindStep(quotationId: string, step: () => Promise<unknown>) {
  try {
    await step();
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "The bind step failed.";
    redirect(`/quotations/${quotationId}/bind?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath(`/quotations/${quotationId}/bind`);
}

export async function acceptQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const method = (formData.get("method") as AcceptanceMethod) || "PORTAL_CLICK";
  const documentUrl = (formData.get("documentUrl") as string) || undefined;

  await runBindStep(quotationId, () =>
    bindingService.captureAcceptance(
      quotationId, session.user.tenantId,
      method, session.user.id,
      documentUrl || undefined,
    ),
  );
}

export async function createMembershipsAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const packageId = (formData.get("packageId") as string) || null;

  await runBindStep(quotationId, () =>
    bindingService.createMemberships(quotationId, session.user.tenantId, session.user.id, { packageId }),
  );
  revalidatePath(`/groups`);
  redirect(`/quotations/${quotationId}/bind`);
}

export async function approveBinderAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await runBindStep(quotationId, () =>
    bindingService.approveBinder(quotationId, session.user.tenantId, session.user.id),
  );
}

export async function postDebitNoteAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await runBindStep(quotationId, () =>
    bindingService.postDebitNote(quotationId, session.user.tenantId, session.user.id),
  );
}
