"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

const BENEFIT_CATEGORIES = [
  "INPATIENT","OUTPATIENT","MATERNITY","DENTAL","OPTICAL",
  "MENTAL_HEALTH","CHRONIC_DISEASE","SURGICAL","AMBULANCE_EMERGENCY",
  "LAST_EXPENSE","WELLNESS_PREVENTIVE","REHABILITATION","CUSTOM",
] as const;

export async function updatePackageAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const tenantId = session.user.tenantId;
  const packageId = formData.get("packageId") as string;

  const pkg = await prisma.package.findUnique({
    where: { id: packageId, tenantId },
    include: { currentVersion: true },
  });
  if (!pkg) notFound();

  // Update package-level fields
  await prisma.package.update({
    where: { id: packageId, tenantId },
    data: {
      name:               formData.get("name") as string,
      description:        (formData.get("description") as string) || null,
      annualLimit:        Number(formData.get("annualLimit")),
      contributionAmount: Number(formData.get("contributionAmount")),
      minAge:             Number(formData.get("minAge")),
      maxAge:             Number(formData.get("maxAge")),
      dependentMaxAge:    Number(formData.get("dependentMaxAge")),
      type:               formData.get("type") as never,
      status:             formData.get("status") as never,
    },
  });

  // Build the new benefit list from the form
  const newBenefits = BENEFIT_CATEGORIES
    .filter(cat => formData.get(`benefit_enabled_${cat}`) === "on")
    .map(cat => ({
      category:        cat as never,
      annualSubLimit:  Number(formData.get(`benefit_limit_${cat}`) ?? 0),
      copayPercentage: Number(formData.get(`benefit_copay_${cat}`) ?? 0),
      waitingPeriodDays: Number(formData.get(`benefit_wait_${cat}`) ?? 0),
    }));

  // Create a new PackageVersion with incremented versionNumber
  const nextVersion = (pkg.currentVersion?.versionNumber ?? 0) + 1;

  const newVersion = await prisma.packageVersion.create({
    data: {
      packageId,
      versionNumber: nextVersion,
      effectiveFrom: new Date(),
      benefits: {
        create: newBenefits,
      },
    },
  });

  // Point the package at the new version
  await prisma.package.update({
    where: { id: packageId },
    data: { currentVersionId: newVersion.id },
  });

  redirect(`/packages/${packageId}`);
}

export async function createSharedLimitAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  void session;

  const packageVersionId = formData.get("packageVersionId") as string;
  const name = (formData.get("name") as string).trim();
  const limitAmount = Number(formData.get("limitAmount"));
  const appliesTo = formData.get("appliesTo") as "MEMBER" | "FAMILY";
  const benefitConfigIds = formData.getAll("benefitConfigIds") as string[];

  if (!name) return { error: "Name is required" };
  if (limitAmount <= 0) return { error: "Limit must be greater than 0" };
  if (benefitConfigIds.length < 2) return { error: "Select at least 2 benefits" };

  const group = await prisma.sharedLimitGroup.create({
    data: { packageVersionId, name, limitAmount, appliesTo },
  });
  await prisma.benefitConfigSharedLimit.createMany({
    data: benefitConfigIds.map(id => ({ sharedLimitGroupId: group.id, benefitConfigId: id })),
  });

  revalidatePath(`/packages/${packageVersionId}/edit`);
  return { success: true };
}

export async function deleteSharedLimitAction(id: string) {
  await requireRole(ROLES.UNDERWRITING);
  await prisma.benefitConfigSharedLimit.deleteMany({ where: { sharedLimitGroupId: id } });
  await prisma.sharedLimitGroup.delete({ where: { id } });
  revalidatePath("/packages");
}

// ── Provider Eligibility ───────────────────────────────────────────────────

export async function createProviderEligibilityAction(_prev: unknown, formData: FormData) {
  await requireRole(ROLES.UNDERWRITING);

  const packageVersionId = formData.get("packageVersionId") as string;
  const inclusionType = formData.get("inclusionType") as "INCLUDE" | "EXCLUDE";
  const providerId = (formData.get("providerId") as string) || null;
  const providerTier = (formData.get("providerTier") as string) || null;

  if (!providerId && !providerTier) return { error: "Select a specific provider or a provider tier" };

  await prisma.packageProviderEligibility.create({
    data: {
      packageVersionId,
      inclusionType,
      providerId: providerId || null,
      providerTier: providerTier as never || null,
    },
  });

  revalidatePath("/packages");
  return { success: true };
}

export async function deleteProviderEligibilityAction(id: string) {
  await requireRole(ROLES.UNDERWRITING);
  await prisma.packageProviderEligibility.delete({ where: { id } });
  revalidatePath("/packages");
}
