"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { canTransitionClaim } from "@/server/services/claim-lifecycle";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function dismissCaseAction(
  alertId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.OPS);
  const reason = (formData.get("reason") as string | null)?.trim();
  if (!reason) return { error: "A dismissal reason is required." };

  await prisma.claimFraudAlert.update({
    where: { id: alertId },
    data: {
      resolved:   true,
      resolvedBy: session.user.id,
      resolvedAt: new Date(),
      notes:      reason,
    },
  });

  await writeAudit({
    userId:      session.user.id,
    action:      "FRAUD_ALERT_DISMISSED",
    module:      "FRAUD",
    description: `Fraud alert dismissed as false positive. Reason: ${reason}`,
    metadata:    { alertId },
  });

  revalidatePath("/fraud");
  redirect("/fraud");
}

export async function escalateCaseAction(
  alertId: string,
  claimId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.OPS);
  const notes = (formData.get("notes") as string | null)?.trim();
  if (!notes) return { error: "Investigation notes are required before escalating." };

  const current = await prisma.claim.findFirst({
    where: { id: claimId, tenantId: session.user.tenantId },
    select: { status: true },
  });
  if (!current) return { error: "Claim not found." };
  // F7.1: a decided/paid claim can no longer be dragged back to review — that
  // would strand its money effects. Void or reverse through settlement instead.
  if (!canTransitionClaim(current.status, "UNDER_REVIEW")) {
    return { error: `Claim is ${current.status.replace(/_/g, " ")} — place holds before the decision; use void/settlement reversal after.` };
  }
  const claim = await prisma.claim.update({
    where: { id: claimId, tenantId: session.user.tenantId },
    data:  { status: "UNDER_REVIEW" },
    select: { claimNumber: true },
  });

  await prisma.claimFraudAlert.update({
    where: { id: alertId },
    data:  { notes },
  });

  await writeAudit({
    userId:      session.user.id,
    action:      "CLAIM_FRAUD_ESCALATED",
    module:      "FRAUD",
    description: `Claim ${claim.claimNumber} escalated to fraud review and placed on hold. Notes: ${notes}`,
    metadata:    { alertId, claimId },
  });

  revalidatePath("/fraud");
  revalidatePath(`/claims/${claimId}`);
  redirect("/fraud");
}
