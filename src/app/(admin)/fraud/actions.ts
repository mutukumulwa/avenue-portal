"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { canTransitionClaim } from "@/server/services/claim-lifecycle";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function dismissAlertAction(alertId: string) {
  const session = await requireRole(ROLES.OPS);

  await prisma.claimFraudAlert.update({
    where: { id: alertId },
    data: {
      resolved:   true,
      resolvedBy: session.user.id,
      resolvedAt: new Date(),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "FRAUD_ALERT_DISMISSED",
    module: "FRAUD",
    description: `Fraud alert ${alertId} dismissed as false positive.`,
    metadata: { alertId },
  });

  revalidatePath("/fraud");
}

/** Open a formal fraud investigation (G5.11) over an alert + its claim. */
export async function openInvestigationFromAlertAction(alertId: string, claimId: string) {
  const session = await requireRole(ROLES.OPS);
  const { FraudInvestigationService } = await import("@/server/services/fraud-engine.service");

  const inv = await FraudInvestigationService.open(session.user.tenantId, {
    claimId,
    fraudAlertId: alertId,
  });

  await writeAudit({
    userId: session.user.id,
    action: "FRAUD_INVESTIGATION_OPENED",
    module: "FRAUD",
    description: `Fraud investigation ${inv.id} opened from alert ${alertId}`,
    metadata: { investigationId: inv.id, alertId, claimId },
  });

  revalidatePath("/fraud");
  revalidatePath("/fraud/investigations");
}

export async function escalateClaimAction(claimId: string): Promise<{ error: string } | void> {
  const session = await requireRole(ROLES.OPS);

  // Lock claim to HELD status so it cannot be paid until resolved
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
    data: { status: "UNDER_REVIEW" },
    select: { claimNumber: true },
  });

  await writeAudit({
    userId: session.user.id,
    action: "CLAIM_FRAUD_ESCALATED",
    module: "FRAUD",
    description: `Claim ${claim.claimNumber} escalated to fraud review and placed on hold.`,
    metadata: { claimId },
  });

  revalidatePath("/fraud");
  revalidatePath(`/claims/${claimId}`);
}
