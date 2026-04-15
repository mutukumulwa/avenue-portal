"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";

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
