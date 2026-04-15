"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTierAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const groupId   = formData.get("groupId") as string;
  const name      = formData.get("name") as string;
  const packageId = formData.get("packageId") as string;
  const contributionRate = Number(formData.get("contributionRate"));
  const description = (formData.get("description") as string) || null;
  const isDefault = formData.get("isDefault") === "true";

  // Verify group belongs to tenant
  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId: session.user.tenantId },
  });
  if (!group) throw new Error("Group not found");

  // If setting as default, clear existing default
  if (isDefault) {
    await prisma.groupBenefitTier.updateMany({
      where: { groupId },
      data: { isDefault: false },
    });
  }

  await prisma.groupBenefitTier.create({
    data: { groupId, name, packageId, contributionRate, description, isDefault },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function updateTierAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tierId    = formData.get("tierId") as string;
  const groupId   = formData.get("groupId") as string;
  const name      = formData.get("name") as string;
  const packageId = formData.get("packageId") as string;
  const contributionRate = Number(formData.get("contributionRate"));
  const description = (formData.get("description") as string) || null;
  const isDefault = formData.get("isDefault") === "true";

  // Verify ownership
  const tier = await prisma.groupBenefitTier.findUnique({
    where: { id: tierId },
    include: { group: { select: { tenantId: true } } },
  });
  if (!tier || tier.group.tenantId !== session.user.tenantId) throw new Error("Not found");

  if (isDefault) {
    await prisma.groupBenefitTier.updateMany({
      where: { groupId },
      data: { isDefault: false },
    });
  }

  await prisma.groupBenefitTier.update({
    where: { id: tierId },
    data: { name, packageId, contributionRate, description, isDefault },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function deleteTierAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tierId  = formData.get("tierId") as string;
  const groupId = formData.get("groupId") as string;

  const tier = await prisma.groupBenefitTier.findUnique({
    where: { id: tierId },
    include: { group: { select: { tenantId: true } }, _count: { select: { members: true } } },
  });
  if (!tier || tier.group.tenantId !== session.user.tenantId) throw new Error("Not found");
  if (tier._count.members > 0) throw new Error(`Cannot delete a tier with ${tier._count.members} member(s) assigned. Reassign them first.`);

  await prisma.groupBenefitTier.delete({ where: { id: tierId } });

  revalidatePath(`/groups/${groupId}`);
}
