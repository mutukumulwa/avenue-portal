"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

// ── Scheme transfer ────────────────────────────────────────────────────────

export async function schemeTransferAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session     = await requireRole(ROLES.UNDERWRITING);
  const tenantId    = session.user.tenantId;
  const memberId    = formData.get("memberId") as string;
  const toGroupId   = formData.get("toGroupId") as string;
  const effectiveDate = new Date(formData.get("effectiveDate") as string);
  const reason      = (formData.get("reason") as string) || "Scheme transfer";

  const [member, toGroup] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId, tenantId }, select: { id: true, groupId: true, packageId: true, memberNumber: true } }),
    prisma.group.findUnique({ where: { id: toGroupId, tenantId }, select: { id: true, packageId: true, packageVersionId: true } }),
  ]);
  if (!member) return { error: "Member not found." };
  if (!toGroup) return { error: "Destination group not found." };
  if (member.groupId === toGroupId) return { error: "Member is already in this group." };

  // Build endorsement number
  const count = await prisma.endorsement.count({ where: { tenantId } });
  const endorsementNumber = `END-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  await prisma.$transaction(async (tx) => {
    // Create SCHEME_TRANSFER endorsement
    await tx.endorsement.create({
      data: {
        tenantId,
        endorsementNumber,
        groupId:       member.groupId,
        toGroupId,
        memberId,
        type:          "SCHEME_TRANSFER",
        status:        "APPROVED",
        effectiveDate,
        requestedBy:   session.user.id,
        changeDetails: { reason, fromGroupId: member.groupId, toGroupId },
        reviewedBy:    session.user.id,
        reviewedAt:    new Date(),
      },
    });

    // Move member to new group and update package to destination group's package
    await tx.member.update({
      where: { id: memberId },
      data: {
        groupId:          toGroupId,
        packageId:        toGroup.packageId,
        packageVersionId: toGroup.packageVersionId,
        benefitTierId:    null, // cleared — assign tier in destination group separately
      },
    });
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_SCHEME_TRANSFER",
    module: "MEMBERS",
    description: `Member ${member.memberNumber} transferred to group ${toGroupId} effective ${effectiveDate.toLocaleDateString()}`,
    metadata: { memberId, fromGroupId: member.groupId, toGroupId },
  });

  revalidatePath(`/members/${memberId}`);
  return {};
}

// ── Category (tier) change within same group ──────────────────────────────

export async function tierChangeAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session       = await requireRole(ROLES.UNDERWRITING);
  const tenantId      = session.user.tenantId;
  const memberId      = formData.get("memberId") as string;
  const toBenefitTierId = formData.get("toBenefitTierId") as string;
  const effectiveDate   = new Date(formData.get("effectiveDate") as string);
  const reason          = (formData.get("reason") as string) || "Category change";

  const [member, tier] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId, tenantId }, select: { id: true, groupId: true, benefitTierId: true, memberNumber: true } }),
    prisma.groupBenefitTier.findUnique({ where: { id: toBenefitTierId }, select: { id: true, packageId: true, groupId: true } }),
  ]);
  if (!member) return { error: "Member not found." };
  if (!tier) return { error: "Benefit tier not found." };
  if (tier.groupId !== member.groupId) return { error: "Tier does not belong to the member's group." };
  if (member.benefitTierId === toBenefitTierId) return { error: "Member is already in this tier." };

  const count = await prisma.endorsement.count({ where: { tenantId } });
  const endorsementNumber = `END-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  await prisma.$transaction(async (tx) => {
    await tx.endorsement.create({
      data: {
        tenantId,
        endorsementNumber,
        groupId:          member.groupId,
        memberId,
        toBenefitTierId,
        type:             "TIER_CHANGE",
        status:           "APPROVED",
        effectiveDate,
        requestedBy:      session.user.id,
        changeDetails:    { reason, fromTierId: member.benefitTierId, toBenefitTierId },
        reviewedBy:       session.user.id,
        reviewedAt:       new Date(),
      },
    });

    await tx.member.update({
      where: { id: memberId },
      data: { benefitTierId: toBenefitTierId, packageId: tier.packageId },
    });
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_TIER_CHANGE",
    module: "MEMBERS",
    description: `Member ${member.memberNumber} moved to tier ${toBenefitTierId} effective ${effectiveDate.toLocaleDateString()}`,
    metadata: { memberId, fromTierId: member.benefitTierId, toBenefitTierId },
  });

  revalidatePath(`/members/${memberId}`);
  return {};
}
