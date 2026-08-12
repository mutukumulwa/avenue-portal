"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContractExtractionService } from "@/server/services/contract-extraction.service";
import { CONTRACT_DATE_LABELS, validateContractTerm } from "@/lib/validation/provider-contract";

// Server actions for the markdown-import wizard (spec §11.3 import mode / §12).

export async function createExtractionAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const markdown = (formData.get("markdown") as string | null)?.trim();
  const fileName = (formData.get("fileName") as string | null)?.trim() || undefined;
  if (!markdown) redirect("/contracts/import?error=Paste+the+markdown+source+first");
  const extraction = await ContractExtractionService.createExtraction(session.user.tenantId, {
    markdown: markdown!,
    fileName,
    createdById: session.user.id,
  });
  revalidatePath("/contracts/import");
  redirect(`/contracts/import/${extraction.id}`);
}

export async function commitExtractionAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const id = formData.get("id") as string;
  const providerId = formData.get("providerId") as string;
  const title = (formData.get("title") as string | null)?.trim();
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const currency = ((formData.get("currency") as string | null)?.trim()) || "KES";
  if (!providerId || !title || !startDate || !endDate) {
    redirect(`/contracts/import/${id}?error=Provider,+title,+start+and+end+date+are+required`);
  }

  // UAT-HF P02.01 — the import door gets the SAME rule as the form. A validator
  // only the UI enforces is not a validator (DEF-050).
  const importedTerm = validateContractTerm({ startDate, endDate });
  if (!importedTerm.ok) {
    const message = Object.entries(importedTerm.fieldErrors)
      .map(([field, messages]) => `${CONTRACT_DATE_LABELS[field] ?? field}: ${messages[0]}`)
      .join(" ");
    redirect(`/contracts/import/${id}?error=${encodeURIComponent(message)}`);
  }
  let result: { contractId: string; imported: number };
  try {
    result = await ContractExtractionService.commit(session.user.tenantId, id, {
      providerId,
      title: title!,
      startDate: importedTerm.dates.startDate,
      endDate: importedTerm.dates.endDate,
      currency,
      createdById: session.user.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Commit failed";
    redirect(`/contracts/import/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/contracts");
  redirect(`/contracts/${result!.contractId}`);
}
