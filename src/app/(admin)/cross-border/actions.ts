"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { CrossBorderService } from "@/server/services/cross-border.service";

const LIST = "/cross-border";
const detail = (id: string) => `/cross-border/${id}`;

function fail(path: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : "Action failed";
  if (msg === "NEXT_REDIRECT") throw err;
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

// ── Facilities ──────────────────────────────────────────────────────────
export async function upsertFacilityAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  try {
    const specialties = (formData.get("specialties") as string || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    await CrossBorderService.upsertFacility(session.user.tenantId, {
      id: (formData.get("id") as string) || undefined,
      name: (formData.get("name") as string)?.trim(),
      country: (formData.get("country") as string)?.trim(),
      city: (formData.get("city") as string) || undefined,
      currency: (formData.get("currency") as string)?.trim() || undefined,
      specialties,
      accreditation: (formData.get("accreditation") as string) || undefined,
      contactEmail: (formData.get("contactEmail") as string) || undefined,
      isVetted: formData.get("isVetted") === "on",
    });
  } catch (err) {
    fail(LIST, err);
  }
  revalidatePath(LIST);
}

export async function retireFacilityAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  await CrossBorderService.retireFacility(session.user.tenantId, formData.get("id") as string);
  revalidatePath(LIST);
}

// ── Cases ───────────────────────────────────────────────────────────────
export async function openCaseAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  let newId = "";
  try {
    const memberId = formData.get("memberId") as string;
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId: session.user.tenantId },
      select: { group: { select: { clientId: true } } },
    });
    if (!member) throw new Error("Member not found");
    const created = await CrossBorderService.openCase(session.user.tenantId, {
      clientId: member.group.clientId,
      memberId,
      diagnosis: (formData.get("diagnosis") as string)?.trim(),
      facilityId: (formData.get("facilityId") as string) || undefined,
      treatmentSummary: (formData.get("treatmentSummary") as string) || undefined,
      createdById: session.user.id,
    });
    newId = created.id;
    await writeAudit({
      userId: session.user.id,
      action: "CROSS_BORDER_CASE_OPENED",
      module: "CROSS_BORDER",
      description: `Opened cross-border case ${created.caseNumber}`,
      metadata: { caseId: created.id },
    });
  } catch (err) {
    fail(LIST, err);
  }
  revalidatePath(LIST);
  redirect(detail(newId));
}

export async function assignFacilityAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.assignFacility(session.user.tenantId, caseId, formData.get("facilityId") as string);
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function captureEstimateAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    const descs = formData.getAll("lineDescription") as string[];
    const amounts = formData.getAll("lineAmount") as string[];
    const currencies = formData.getAll("lineCurrency") as string[];
    const lines = descs
      .map((d, i) => ({ description: d?.trim(), amount: Number(amounts[i]), currency: currencies[i]?.trim() }))
      .filter((l) => l.description && l.currency && l.amount > 0);
    if (lines.length === 0) throw new Error("Add at least one estimate line");
    await CrossBorderService.captureEstimate(session.user.tenantId, caseId, lines);
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function issueGopAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.issueGop(session.user.tenantId, caseId, {
      amount: Number(formData.get("amount")),
      currency: (formData.get("currency") as string)?.trim(),
      approvedLimitUgx: Number(formData.get("approvedLimitUgx")),
    });
    await writeAudit({
      userId: session.user.id,
      action: "CROSS_BORDER_GOP_ISSUED",
      module: "CROSS_BORDER",
      description: `Issued GOP on cross-border case ${caseId}`,
      metadata: { caseId },
    });
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function startTreatmentAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.startTreatment(session.user.tenantId, caseId);
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function addInvoiceLineAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.addInvoiceLine(session.user.tenantId, caseId, {
      description: (formData.get("description") as string)?.trim(),
      amount: Number(formData.get("amount")),
      currency: (formData.get("currency") as string)?.trim(),
    });
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function consolidateInvoiceAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    const c = await CrossBorderService.consolidateInvoice(session.user.tenantId, caseId);
    await writeAudit({
      userId: session.user.id,
      action: "CROSS_BORDER_INVOICE_CONSOLIDATED",
      module: "CROSS_BORDER",
      description: `Consolidated invoice ${c.invoiceReference} on case ${caseId}`,
      metadata: { caseId, invoiceReference: c.invoiceReference },
    });
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function settleAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.settle(session.user.tenantId, caseId);
    await writeAudit({
      userId: session.user.id,
      action: "CROSS_BORDER_CASE_SETTLED",
      module: "CROSS_BORDER",
      description: `Settled cross-border case ${caseId}`,
      metadata: { caseId },
    });
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}

export async function cancelCaseAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const caseId = formData.get("caseId") as string;
  try {
    await CrossBorderService.cancelCase(session.user.tenantId, caseId);
  } catch (err) {
    fail(detail(caseId), err);
  }
  revalidatePath(detail(caseId));
  redirect(detail(caseId));
}
