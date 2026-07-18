"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { CaseService, LouService } from "@/server/services/case.service";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClaimLineCategory } from "@prisma/client";

export async function addServiceEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;

  await CaseService.addServiceEntry({
    tenantId: session.user.tenantId,
    caseId,
    entryDate: new Date((formData.get("entryDate") as string) || Date.now()),
    category: formData.get("category") as ClaimLineCategory,
    serviceCode: (formData.get("serviceCode") as string) || null,
    description: formData.get("description") as string,
    quantity: Number(formData.get("quantity") || 1),
    unitAmount: Number(formData.get("unitAmount") || 0),
    source: "MANUAL",
    enteredById: session.user.id,
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function voidServiceEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  await CaseService.voidServiceEntry(
    session.user.tenantId,
    caseId,
    formData.get("entryId") as string,
    (formData.get("reason") as string) || "Voided by clinical officer",
  );
  revalidatePath(`/cases/${caseId}`);
}

export async function attachCasePreauthAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  await CaseService.attachPreauth(session.user.tenantId, caseId, formData.get("preauthId") as string);
  revalidatePath(`/cases/${caseId}`);
}

export async function issueCaseLouAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  const lou = await LouService.issue({
    tenantId: session.user.tenantId,
    memberId: formData.get("memberId") as string,
    providerId: formData.get("providerId") as string,
    caseId,
    amountCeiling: Number(formData.get("amountCeiling")),
    validityDays: Number(formData.get("validityDays") || 30),
    notes: (formData.get("notes") as string) || undefined,
    issuedById: session.user.id,
  });
  await writeAudit({
    userId: session.user.id,
    action: "LOU_ISSUED",
    module: "CASES",
    description: `LOU ${lou.louNumber} issued (ceiling ${Number(lou.amountCeiling).toLocaleString()})`,
    metadata: { caseId, louId: lou.id },
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function cutInterimSliceAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;

  // IPL-001: cut a Friday interim bill slice from an OPEN case. Guard violations
  // (nothing new to bill, cut-off before admission) surface as a banner, never a
  // server exception (same PR-032 shape as close & file).
  let slice;
  try {
    slice = await CaseService.cutInterimSlice({
      tenantId: session.user.tenantId,
      caseId,
      cutoffDate: new Date((formData.get("cutoffDate") as string) || Date.now()),
      invoiceNumber: (formData.get("invoiceNumber") as string) || null,
      cutById: session.user.id,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "Cut interim slice failed";
    redirect(`/cases/${caseId}?error=${encodeURIComponent(msg)}`);
  }
  await writeAudit({
    userId: session.user.id,
    action: "CASE_INTERIM_SLICE_CUT",
    module: "CASES",
    description: `Case ${caseId.slice(0, 8)} — interim slice ${slice.claimNumber} cut (invoice ${slice.invoiceNumber})`,
    metadata: { caseId, claimId: slice.id, sliceSeq: slice.caseSliceSeq },
  });
  redirect(`/claims/${slice.id}`);
}

export async function closeAndFileAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;

  // PR-032: guard violations (empty case, already filed) surface as a banner
  // on the case page — never as an unhandled server exception.
  let claim;
  try {
    claim = await CaseService.closeAndFile(session.user.tenantId, caseId, session.user.id);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "Close & file failed";
    redirect(`/cases/${caseId}?error=${encodeURIComponent(msg)}`);
  }
  await writeAudit({
    userId: session.user.id,
    action: "CASE_FILED",
    module: "CASES",
    // IPL-001: closeAndFile returns null when every service was already billed on
    // interim slices — the case closes with no final claim (the slices ARE the claims).
    description: claim
      ? `Case ${caseId.slice(0, 8)} closed — filed as claim ${claim.claimNumber}`
      : `Case ${caseId.slice(0, 8)} closed — all services already billed on interim slices; no final claim`,
    metadata: { caseId, claimId: claim?.id ?? null },
  });
  redirect(claim ? `/claims/${claim.id}` : `/cases/${caseId}?closed=1`);
}

export async function cancelCaseAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  await CaseService.cancelCase(
    session.user.tenantId,
    caseId,
    session.user.id,
    (formData.get("reason") as string) || "Cancelled",
  );
  redirect("/cases");
}
