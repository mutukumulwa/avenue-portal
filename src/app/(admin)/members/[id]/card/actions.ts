"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const CARD_REPLACEMENT_FEE = 500; // KES — configurable

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

// ── Card replacement request ───────────────────────────────────────────────
// Step 1: member reports lost/damaged card → raise fee invoice on the group

export async function requestCardReplacementAction(
  formData: FormData,
): Promise<{ error?: string; invoiceId?: string }> {
  const session   = await requireRole(ROLES.OPS);
  const tenantId  = session.user.tenantId;
  const memberId  = formData.get("memberId") as string;
  const reason    = (formData.get("reason") as string) || "Lost card";

  const member = await prisma.member.findFirst({
    where: { id: memberId, tenantId },
    select: { id: true, firstName: true, lastName: true, memberNumber: true, groupId: true },
  });
  if (!member) return { error: "Member not found." };

  // Build a card-replacement invoice (separate from premium invoices)
  const count = await prisma.invoice.count({ where: { tenantId } });
  const invoiceNumber = `INV-CARD-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      groupId:      member.groupId,
      period:       new Date().toISOString().slice(0, 7),
      memberCount:  1,
      ratePerMember: CARD_REPLACEMENT_FEE,
      totalAmount:  CARD_REPLACEMENT_FEE,
      balance:      CARD_REPLACEMENT_FEE,
      stampDuty:    0,
      trainingLevy: 0,
      phcf:         0,
      taxTotal:     0,
      dueDate,
      notes:        `Card replacement fee — ${member.firstName} ${member.lastName} (${member.memberNumber}). Reason: ${reason}`,
    },
  });

  await Promise.all([
    prisma.activityLog.create({
      data: {
        entityType:  "MEMBER",
        entityId:    memberId,
        memberId,
        action:      "CARD_REPLACEMENT_REQUESTED",
        description: `Card replacement requested. Reason: ${reason}. Fee invoice ${invoiceNumber} raised.`,
        userId:      session.user.id,
        metadata:    { reason, invoiceId: invoice.id, fee: CARD_REPLACEMENT_FEE },
      },
    }),
    writeAudit({
      userId: session.user.id,
      action: "CARD_REPLACEMENT_REQUESTED",
      module: "MEMBERS",
      description: `Card replacement requested for ${member.firstName} ${member.lastName} (${member.memberNumber}). Invoice: ${invoiceNumber}`,
      metadata: { memberId, invoiceId: invoice.id },
    }),
  ]);

  revalidatePath(`/members/${memberId}`);
  return { invoiceId: invoice.id };
}

// Step 2: once fee is confirmed paid, issue the replacement card (reuses issueCardAction)
// The UI routes to issueCardAction for the actual new card number entry.
