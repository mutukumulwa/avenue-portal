"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FraudInvestigationService } from "@/server/services/fraud-engine.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/fraud/investigations";

export async function openInvestigationAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const claimId = ((formData.get("claimId") as string) || "").trim() || undefined;
  const fraudAlertId = ((formData.get("fraudAlertId") as string) || "").trim() || undefined;

  let errorMsg = "";
  try {
    if (!claimId && !fraudAlertId) throw new Error("Provide a claim and/or a fraud alert to investigate.");
    if (claimId) {
      const claim = await prisma.claim.findFirst({ where: { id: claimId, tenantId }, select: { id: true } });
      if (!claim) throw new Error("Claim not found.");
    }
    const inv = await FraudInvestigationService.open(tenantId, { claimId, fraudAlertId, assigneeId: session.user.id });
    await writeAudit({
      userId: session.user.id,
      action: "FRAUD_INVESTIGATION_OPENED",
      module: "FRAUD",
      description: `Fraud investigation ${inv.id} opened${claimId ? ` on claim ${claimId}` : ""}`,
      metadata: { investigationId: inv.id, claimId: claimId ?? null, fraudAlertId: fraudAlertId ?? null },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to open investigation";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function assignInvestigationAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const id = formData.get("id") as string;
  await FraudInvestigationService.assign(session.user.tenantId, id, session.user.id);
  await writeAudit({
    userId: session.user.id,
    action: "FRAUD_INVESTIGATION_ASSIGNED",
    module: "FRAUD",
    description: `Fraud investigation ${id} assigned to self`,
    metadata: { investigationId: id },
  });
  revalidatePath(PATH);
}

export async function resolveInvestigationAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const id = formData.get("id") as string;
  const status = formData.get("status") as "SUBSTANTIATED" | "DISMISSED";
  const findings = ((formData.get("findings") as string) || "").trim() || undefined;
  const outcome = ((formData.get("outcome") as string) || "").trim() || undefined;

  let errorMsg = "";
  try {
    if (!["SUBSTANTIATED", "DISMISSED"].includes(status)) throw new Error("Invalid resolution.");
    if (status === "SUBSTANTIATED" && !findings) throw new Error("Findings are required to substantiate.");
    await FraudInvestigationService.resolve(session.user.tenantId, id, status, { findings, outcome });
    await writeAudit({
      userId: session.user.id,
      action: `FRAUD_INVESTIGATION_${status}`,
      module: "FRAUD",
      description: `Fraud investigation ${id} closed as ${status}`,
      metadata: { investigationId: id, findings: findings ?? null, outcome: outcome ?? null },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to resolve investigation";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}
