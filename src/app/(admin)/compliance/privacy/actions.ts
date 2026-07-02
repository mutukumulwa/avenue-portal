"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { DpoService } from "@/server/services/dpo.service";
import type { DsrType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/compliance/privacy";
const DSR_TYPES = ["ACCESS", "CORRECTION", "OBJECTION", "ERASURE"] as const;

function fail(message: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(message)}`);
}

/** Open a data-subject request with the statutory 30-day SLA (G1.2). */
export async function openDsrAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;
  const memberId = ((formData.get("memberId") as string) || "").trim();
  const type = (formData.get("type") as string) || "";
  const notes = ((formData.get("notes") as string) || "").trim() || undefined;

  if (!memberId) fail("Member is required.");
  if (!DSR_TYPES.includes(type as never)) fail("Choose a request type.");
  const member = await prisma.member.findFirst({ where: { id: memberId, tenantId }, select: { id: true } });
  if (!member) fail("Member not found.");

  const dsr = await DpoService.openDsr(tenantId, memberId, type as DsrType, notes);
  await writeAudit({
    userId: session.user.id,
    action: "DSR_OPENED",
    module: "COMPLIANCE",
    description: `Data-subject request ${dsr.id} opened (${type}); SLA ${dsr.slaDeadlineAt.toISOString().slice(0, 10)}`,
    metadata: { dsrId: dsr.id, memberId, type },
  });
  revalidatePath(PATH);
}

export async function setDsrStatusAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const status = formData.get("status") as "IN_PROGRESS" | "FULFILLED" | "REJECTED";
  const fulfilmentRef = ((formData.get("fulfilmentRef") as string) || "").trim() || undefined;

  if (!["IN_PROGRESS", "FULFILLED", "REJECTED"].includes(status)) fail("Invalid status.");
  await DpoService.setDsrStatus(session.user.tenantId, id, status, fulfilmentRef);
  await writeAudit({
    userId: session.user.id,
    action: `DSR_${status}`,
    module: "COMPLIANCE",
    description: `Data-subject request ${id} → ${status}`,
    metadata: { dsrId: id, fulfilmentRef: fulfilmentRef ?? null },
  });
  revalidatePath(PATH);
}

/** Register a data processor / sub-processor (G1.2). */
export async function recordProcessorAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const name = ((formData.get("name") as string) || "").trim();
  const role = ((formData.get("role") as string) || "PROCESSOR").trim();
  const location = ((formData.get("location") as string) || "").trim() || null;
  const dataCategories = ((formData.get("dataCategories") as string) || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const dpaRef = ((formData.get("dpaRef") as string) || "").trim() || null;

  if (!name) fail("Processor name is required.");

  await prisma.processorRegister.create({
    data: { tenantId: session.user.tenantId, name, role, location, dataCategories, dpaRef, subProcessors: [] },
  });
  await writeAudit({
    userId: session.user.id,
    action: "PROCESSOR_RECORDED",
    module: "COMPLIANCE",
    description: `Data ${role.toLowerCase()} ${name} registered${location ? ` (${location})` : ""}`,
    metadata: { name, role, location },
  });
  revalidatePath(PATH);
}

export async function recordBreachAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const scope = ((formData.get("scope") as string) || "").trim();
  const severity = (formData.get("severity") as string) || "MEDIUM";
  const narrative = ((formData.get("narrative") as string) || "").trim() || null;
  const detectedAt = new Date((formData.get("detectedAt") as string) || "");

  if (!scope) fail("Breach scope is required.");
  if (isNaN(detectedAt.getTime())) fail("Detection date is required.");
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) fail("Invalid severity.");

  // 72h regulator-notification deadline (NITA-U / PDPO practice).
  const notifiableBy = new Date(detectedAt.getTime() + 72 * 3600 * 1000);
  await prisma.breachIncident.create({
    data: {
      tenantId: session.user.tenantId,
      detectedAt, scope, severity: severity as never, narrative, notifiableBy,
    },
  });
  await writeAudit({
    userId: session.user.id,
    action: "BREACH_RECORDED",
    module: "COMPLIANCE",
    description: `Data breach recorded (${severity}); notifiable by ${notifiableBy.toISOString().slice(0, 10)}`,
    metadata: { scope, severity },
  });
  revalidatePath(PATH);
}

export async function markBreachNotifiedAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const breach = await prisma.breachIncident.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!breach) return;
  await prisma.breachIncident.update({ where: { id }, data: { regulatorNotified: true } });
  await writeAudit({
    userId: session.user.id,
    action: "BREACH_REGULATOR_NOTIFIED",
    module: "COMPLIANCE",
    description: `Data breach ${id} marked regulator-notified`,
    metadata: { breachId: id },
  });
  revalidatePath(PATH);
}
