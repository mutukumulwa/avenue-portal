"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";

export async function createPackageAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const tenantId = session.user.tenantId;

  // Extract form
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as "INDIVIDUAL" | "FAMILY" | "GROUP" | "CORPORATE";
  const annualLimit = Number(formData.get("annualLimit"));
  const contributionAmount = Number(formData.get("contributionAmount"));
  const minAge = Number(formData.get("minAge"));
  const maxAge = Number(formData.get("maxAge"));

  // Create core benefits
  const inpatientLimit = Number(formData.get("inpatientLimit") || 0);
  const outpatientLimit = Number(formData.get("outpatientLimit") || 0);

  const benefits: { category: "INPATIENT" | "OUTPATIENT"; annualSubLimit: number; copayPercentage: number }[] = [];
  if (inpatientLimit > 0) {
    benefits.push({ category: "INPATIENT", annualSubLimit: inpatientLimit, copayPercentage: 0 });
  }
  if (outpatientLimit > 0) {
    benefits.push({ category: "OUTPATIENT", annualSubLimit: outpatientLimit, copayPercentage: 0 });
  }

  await PackagesService.createPackage(tenantId, {
    name,
    description,
    type,
    annualLimit,
    contributionAmount,
    minAge,
    maxAge,
    status: "ACTIVE",
    benefits: benefits.length > 0 ? benefits : [{ category: "INPATIENT", annualSubLimit: annualLimit }],
  });

  redirect("/packages");
}
