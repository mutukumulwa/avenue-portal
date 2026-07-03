"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { LouService } from "@/server/services/case.service";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function issueLouAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const memberNumber = (formData.get("memberNumber") as string)?.trim();
  const member = await prisma.member.findFirst({
    where: { tenantId, memberNumber },
    select: { id: true },
  });
  if (!member) throw new Error(`No member found with number "${memberNumber}"`);

  const lou = await LouService.issue({
    tenantId,
    memberId: member.id,
    providerId: formData.get("providerId") as string,
    amountCeiling: Number(formData.get("amountCeiling")),
    validityDays: Number(formData.get("validityDays") || 30),
    notes: (formData.get("notes") as string) || undefined,
    issuedById: session.user.id,
  });

  await writeAudit({
    userId: session.user.id,
    action: "LOU_ISSUED",
    module: "CASES",
    description: `LOU ${lou.louNumber} issued to ${lou.provider.name} (ceiling ${Number(lou.amountCeiling).toLocaleString()})`,
    metadata: { louId: lou.id },
  });
  revalidatePath("/lou");
}

export async function cancelLouAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const louId = formData.get("louId") as string;
  await LouService.cancel(session.user.tenantId, louId);
  await writeAudit({
    userId: session.user.id,
    action: "LOU_CANCELLED",
    module: "CASES",
    description: `LOU ${louId.slice(0, 8)} cancelled`,
    metadata: { louId },
  });
  revalidatePath("/lou");
}
