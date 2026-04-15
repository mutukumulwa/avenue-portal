"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function issueCardAction(
  memberId: string,
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireRole(ROLES.OPS);

  const cardNumber = (formData.get("cardNumber") as string | null)?.trim();
  if (!cardNumber) return { error: "Card number is required." };

  // Confirm member belongs to this tenant
  const member = await prisma.member.findFirst({
    where: { id: memberId, tenantId: session.user.tenantId },
    select: { id: true, firstName: true, lastName: true, memberNumber: true, smartCardNumber: true },
  });
  if (!member) return { error: "Member not found." };

  const isReissue = !!member.smartCardNumber;

  await prisma.$transaction([
    // Update the card number on the member record
    prisma.member.update({
      where: { id: memberId },
      data: { smartCardNumber: cardNumber },
    }),
    // Write an activity log entry
    prisma.activityLog.create({
      data: {
        entityType:  "MEMBER",
        entityId:    memberId,
        memberId,
        action:      "CARD_ISSUED",
        description: isReissue
          ? `SMART card re-issued. New card: ${cardNumber} (previously: ${member.smartCardNumber})`
          : `SMART card issued: ${cardNumber}`,
        userId: session.user.id,
        metadata: { cardNumber, isReissue },
      },
    }),
  ]);

  await writeAudit({
    userId: session.user.id,
    action: isReissue ? "CARD_REISSUED" : "CARD_ISSUED",
    module: "MEMBERS",
    description: `${isReissue ? "Re-issued" : "Issued"} SMART card ${cardNumber} to ${member.firstName} ${member.lastName} (${member.memberNumber})`,
    metadata: { memberId, cardNumber },
  });

  revalidatePath(`/members/${memberId}`);
  return { success: true };
}
