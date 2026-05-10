"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertRateTableEntryAction(data: {
  id?: string;
  pricingModelId: string;
  minAge: number;
  maxAge: number;
  gender: string;
  familySize: string;
  location?: string;
  baseRate: number;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const model = await prisma.pricingModel.findUnique({
    where: { id: data.pricingModelId, tenantId: session.user.tenantId },
  });
  if (!model) throw new Error("Pricing model not found");

  if (data.id) {
    await prisma.contributionRateTable.update({
      where: { id: data.id },
      data: { minAge: data.minAge, maxAge: data.maxAge, gender: data.gender, familySize: data.familySize, location: data.location, baseRate: data.baseRate },
    });
  } else {
    await prisma.contributionRateTable.create({
      data: { pricingModelId: data.pricingModelId, minAge: data.minAge, maxAge: data.maxAge, gender: data.gender, familySize: data.familySize, location: data.location, baseRate: data.baseRate },
    });
  }

  revalidatePath(`/settings/pricing-models/${data.pricingModelId}`);
}

export async function deleteRateTableEntryAction(id: string, pricingModelId: string) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const entry = await prisma.contributionRateTable.findUnique({
    where: { id },
    include: { pricingModel: true },
  });
  if (!entry || entry.pricingModel.tenantId !== session.user.tenantId) throw new Error("Entry not found");

  await prisma.contributionRateTable.delete({ where: { id } });
  revalidatePath(`/settings/pricing-models/${pricingModelId}`);
}
