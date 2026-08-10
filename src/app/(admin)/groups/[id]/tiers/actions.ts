"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { tierSchema } from "@/lib/validation/group";

/**
 * WP-S3 — benefit-tier writes, hardened.
 *
 * Fixes at `39bb24e`: `Number(formData.get("contributionRate"))` put NaN into a
 * Decimal; `packageId` was never tenant-verified; the default-tier flip was two
 * separate `updateMany`/`create` calls (a crash between them left the group with
 * ZERO defaults); no audit on any of the three actions; the default tier could
 * be deleted; and an in-use tier's package could be swapped out from under its
 * members. These validate through `tierSchema`, flip the default inside a
 * transaction, audit before/after, protect the default from deletion, and route
 * an in-use package change to the member-transfer (Tier Change endorsement) flow.
 *
 * These actions throw on failure; the caller (`BenefitTiersCard`) surfaces the
 * message. We throw a clean single-line message (not a raw ZodError).
 */

function parseTier(formData: FormData) {
  const parsed = tierSchema.safeParse({
    name: formData.get("name"),
    packageId: formData.get("packageId"),
    contributionRate: formData.get("contributionRate"),
    description: formData.get("description"),
    // hidden "false" + checkbox "true" → checked iff "true" is present (order-safe).
    isDefault: formData.getAll("isDefault").includes("true"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid tier details.");
  }
  return parsed.data;
}

async function assertPackageInTenant(packageId: string, tenantId: string) {
  const pkg = await prisma.package.findFirst({
    where: { id: packageId, tenantId },
    select: { id: true },
  });
  if (!pkg) throw new Error("Selected package does not exist for this tenant.");
}

export async function createTierAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const groupId = formData.get("groupId") as string;
  const data = parseTier(formData);

  // Verify group belongs to tenant
  const group = await prisma.group.findFirst({
    where: { id: groupId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!group) throw new Error("Group not found");

  await assertPackageInTenant(data.packageId, session.user.tenantId);

  // Transactional: clear the existing default and create the new tier atomically
  // so a failure can never strand the group with zero (or two) defaults.
  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.groupBenefitTier.updateMany({ where: { groupId }, data: { isDefault: false } });
    }
    return tx.groupBenefitTier.create({
      data: {
        groupId,
        name: data.name,
        packageId: data.packageId,
        contributionRate: data.contributionRate,
        description: data.description,
        isDefault: data.isDefault,
      },
    });
  });

  await writeAudit({
    userId: session.user.id,
    action: "GROUP_TIER_CREATED",
    module: "GROUPS",
    description: `Benefit tier created: ${data.name}`,
    metadata: {
      groupId,
      tierId: created.id,
      before: JSON.stringify(null),
      after: JSON.stringify({
        name: data.name,
        packageId: data.packageId,
        contributionRate: data.contributionRate,
        isDefault: data.isDefault,
      }),
    },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function updateTierAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const tierId = formData.get("tierId") as string;
  const groupId = formData.get("groupId") as string;
  const data = parseTier(formData);

  // Verify ownership + read current state for the in-use guard + audit diff.
  const tier = await prisma.groupBenefitTier.findUnique({
    where: { id: tierId },
    include: { group: { select: { tenantId: true } }, _count: { select: { members: true } } },
  });
  if (!tier || tier.group.tenantId !== session.user.tenantId) throw new Error("Not found");

  await assertPackageInTenant(data.packageId, session.user.tenantId);

  // In-use package change → member-transfer flow (never silently re-price members).
  if (data.packageId !== tier.packageId && tier._count.members > 0) {
    throw new Error(
      `This tier has ${tier._count.members} member(s). Change its package via a Tier Change endorsement so each member is re-priced and audited.`,
    );
  }

  // Protect the exactly-one-default invariant: refuse to unset the last default.
  if (tier.isDefault && !data.isDefault) {
    const otherDefault = await prisma.groupBenefitTier.findFirst({
      where: { groupId, isDefault: true, id: { not: tierId } },
      select: { id: true },
    });
    if (!otherDefault) {
      throw new Error("Set another tier as the default before removing the default flag from this one.");
    }
  }

  const before = {
    name: tier.name,
    packageId: tier.packageId,
    contributionRate: Number(tier.contributionRate),
    isDefault: tier.isDefault,
  };

  await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.groupBenefitTier.updateMany({ where: { groupId }, data: { isDefault: false } });
    }
    await tx.groupBenefitTier.update({
      where: { id: tierId },
      data: {
        name: data.name,
        packageId: data.packageId,
        contributionRate: data.contributionRate,
        description: data.description,
        isDefault: data.isDefault,
      },
    });
  });

  await writeAudit({
    userId: session.user.id,
    action: "GROUP_TIER_UPDATED",
    module: "GROUPS",
    description: `Benefit tier updated: ${data.name}`,
    metadata: {
      groupId,
      tierId,
      before: JSON.stringify(before),
      after: JSON.stringify({
        name: data.name,
        packageId: data.packageId,
        contributionRate: data.contributionRate,
        isDefault: data.isDefault,
      }),
    },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function deleteTierAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const tierId = formData.get("tierId") as string;
  const groupId = formData.get("groupId") as string;

  const tier = await prisma.groupBenefitTier.findUnique({
    where: { id: tierId },
    include: { group: { select: { tenantId: true } }, _count: { select: { members: true } } },
  });
  if (!tier || tier.group.tenantId !== session.user.tenantId) throw new Error("Not found");
  if (tier._count.members > 0) {
    throw new Error(`Cannot delete a tier with ${tier._count.members} member(s) assigned. Reassign them first.`);
  }
  // Protect the default tier — a group that runs tiers must keep one default so
  // enrolment can auto-assign it. Promote another tier to default first.
  if (tier.isDefault) {
    throw new Error("Cannot delete the default tier. Set another tier as the default first.");
  }

  await prisma.groupBenefitTier.delete({ where: { id: tierId } });

  await writeAudit({
    userId: session.user.id,
    action: "GROUP_TIER_DELETED",
    module: "GROUPS",
    description: `Benefit tier deleted: ${tier.name}`,
    metadata: {
      groupId,
      tierId,
      before: JSON.stringify({ name: tier.name, packageId: tier.packageId, isDefault: tier.isDefault }),
      after: JSON.stringify(null),
    },
  });

  revalidatePath(`/groups/${groupId}`);
}
