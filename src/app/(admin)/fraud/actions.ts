"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
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

export async function escalateClaimAction(claimId: string) {
  const session = await requireRole(ROLES.OPS);

  // Lock claim to HELD status so it cannot be paid until resolved
  const claim = await prisma.claim.update({
    where: { id: claimId },
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
