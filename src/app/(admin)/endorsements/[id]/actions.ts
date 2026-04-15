"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { EndorsementsService } from "@/server/services/endorsement.service";
import { prisma } from "@/lib/prisma";

export async function approveEndorsementAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const endorsementId = formData.get("endorsementId") as string;
  await EndorsementsService.approveEndorsement(session.user.tenantId, endorsementId, session.user.id);
  redirect("/endorsements");
}

export async function rejectEndorsementAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const endorsementId = formData.get("endorsementId") as string;
  await prisma.endorsement.update({
    where: { id: endorsementId, tenantId: session.user.tenantId },
    data: { status: "REJECTED", reviewedBy: session.user.id, reviewedAt: new Date() },
  });
  redirect("/endorsements");
}
