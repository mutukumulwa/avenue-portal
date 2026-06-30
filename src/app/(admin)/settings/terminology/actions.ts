"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TerminologyService } from "@/server/services/terminology.service";
import { writeAudit } from "@/lib/audit";
import type { TerminologyScope } from "@prisma/client";

const PATH = "/settings/terminology";

export async function createTermAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  let errorMsg = "";
  try {
    const scope = formData.get("scope") as TerminologyScope;
    const clientId = (formData.get("clientId") as string) || null;
    const locale = (formData.get("locale") as string) || null;
    const key = (formData.get("key") as string)?.trim();
    const displayText = (formData.get("displayText") as string)?.trim();
    const context = (formData.get("context") as string) || null;

    if (!key || !displayText) throw new Error("Key and display text are required.");

    const entry = await TerminologyService.createDraft(
      session.user.tenantId,
      { scope, clientId, locale, key, displayText, context },
      session.user.id,
    );
    await writeAudit({
      userId: session.user.id,
      action: "TERM_DRAFTED",
      module: "TERMINOLOGY",
      description: `Drafted term "${key}" → "${displayText}" (${scope})`,
      metadata: { entryId: entry.id, scope },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to create term";
  }
  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function submitTermAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  await TerminologyService.submit(session.user.tenantId, id, session.user.id);
  revalidatePath(PATH);
}

export async function approveTermAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  let errorMsg = "";
  try {
    await TerminologyService.approve(session.user.tenantId, id, session.user.id);
    await writeAudit({
      userId: session.user.id,
      action: "TERM_APPROVED",
      module: "TERMINOLOGY",
      description: `Approved terminology entry ${id}`,
      metadata: { entryId: id },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to approve";
  }
  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function rejectTermAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const notes = (formData.get("notes") as string) || undefined;
  await TerminologyService.reject(session.user.tenantId, id, session.user.id, notes);
  await writeAudit({
    userId: session.user.id,
    action: "TERM_REJECTED",
    module: "TERMINOLOGY",
    description: `Rejected terminology entry ${id}`,
    metadata: { entryId: id },
  });
  revalidatePath(PATH);
}
