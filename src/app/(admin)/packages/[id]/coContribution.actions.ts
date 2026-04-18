"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCoContributionRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const packageId     = formData.get("packageId") as string;
  const benefitCat    = (formData.get("benefitCategory") as string) || null;
  const networkTier   = formData.get("networkTier") as string;
  const type          = formData.get("type") as string;
  const fixedAmount   = formData.get("fixedAmount") ? Number(formData.get("fixedAmount")) : null;
  const percentage    = formData.get("percentage")  ? Number(formData.get("percentage"))  : null;
  const perVisitCap   = formData.get("perVisitCap") ? Number(formData.get("perVisitCap")) : null;

  if (!packageId || !networkTier || !type) return { error: "Missing required fields." };
  if (type === "FIXED_AMOUNT" && !fixedAmount) return { error: "Fixed amount required." };
  if ((type === "PERCENTAGE" || type === "HYBRID") && !percentage) return { error: "Percentage required." };

  // Verify package belongs to this tenant
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { tenantId: true } });
  if (!pkg || pkg.tenantId !== session.user.tenantId) return { error: "Package not found." };

  await prisma.coContributionRule.create({
    data: {
      packageId,
      tenantId: session.user.tenantId,
      benefitCategory: benefitCat as never,
      networkTier: networkTier as never,
      type: type as never,
      fixedAmount,
      percentage,
      perVisitCap,
      effectiveFrom: new Date(),
    },
  });

  revalidatePath(`/packages/${packageId}`);
  return {};
}

export async function toggleCoContributionRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const ruleId    = formData.get("ruleId") as string;
  const packageId = formData.get("packageId") as string;

  const rule = await prisma.coContributionRule.findUnique({
    where: { id: ruleId },
    select: { tenantId: true, isActive: true },
  });
  if (!rule || rule.tenantId !== session.user.tenantId) return { error: "Rule not found." };

  await prisma.coContributionRule.update({
    where: { id: ruleId },
    data: { isActive: !rule.isActive },
  });

  revalidatePath(`/packages/${packageId}`);
  return {};
}

export async function deleteCoContributionRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const ruleId    = formData.get("ruleId") as string;
  const packageId = formData.get("packageId") as string;

  const rule = await prisma.coContributionRule.findUnique({
    where: { id: ruleId },
    select: { tenantId: true },
  });
  if (!rule || rule.tenantId !== session.user.tenantId) return { error: "Rule not found." };

  await prisma.coContributionRule.delete({ where: { id: ruleId } });

  revalidatePath(`/packages/${packageId}`);
  return {};
}

export async function upsertAnnualCapAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const packageId   = formData.get("packageId") as string;
  const individual  = Number(formData.get("individualCap"));
  const family      = formData.get("familyCap") ? Number(formData.get("familyCap")) : null;

  if (!packageId || isNaN(individual) || individual <= 0) return { error: "Individual cap is required." };

  const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { tenantId: true } });
  if (!pkg || pkg.tenantId !== session.user.tenantId) return { error: "Package not found." };

  await prisma.annualCoContributionCap.upsert({
    where: { packageId },
    update: { individualCap: individual, familyCap: family },
    create: { packageId, tenantId: session.user.tenantId, individualCap: individual, familyCap: family },
  });

  revalidatePath(`/packages/${packageId}`);
  return {};
}
