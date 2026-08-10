"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { capsSchema } from "@/lib/validation/co-contribution";
import { ok, fail, type ActionResult } from "@/lib/action-result";

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
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const packageId = formData.get("packageId") as string;
  if (!packageId) return fail({ packageId: ["Package is required."] });

  // Optional family cap: an absent or blank field means "no family cap" (D4).
  // Coercion would otherwise turn "" into 0 and trip the positive() check.
  const rawFamily = formData.get("familyCap");
  const parsed = capsSchema.safeParse({
    individualCap: formData.get("individualCap"),
    familyCap: rawFamily === null || rawFamily === "" ? null : rawFamily,
  });
  if (!parsed.success) {
    // Do NOT throw for validation — return field errors so the form can render
    // them adjacent to the inputs and preserve entered values (SP-2).
    return fail(parsed.error.flatten().fieldErrors);
  }
  const { individualCap, familyCap } = parsed.data;

  // Preserve tenant scoping: the package must belong to the actor's tenant.
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    select: { tenantId: true },
  });
  if (!pkg || pkg.tenantId !== session.user.tenantId) {
    return fail(undefined, "Package not found.");
  }

  // Atomic read-then-write so the audit before/after is a coherent snapshot
  // (SP-5 mutation envelope).
  const prior = await prisma.$transaction(async (tx) => {
    const before = await tx.annualCoContributionCap.findUnique({
      where: { packageId },
      select: { individualCap: true, familyCap: true },
    });
    await tx.annualCoContributionCap.upsert({
      where: { packageId },
      update: { individualCap, familyCap },
      create: { packageId, tenantId: session.user.tenantId, individualCap, familyCap },
    });
    return before;
  });

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_CAPS_UPSERT",
    module: "PACKAGES",
    description: `Annual co-contribution caps updated for package ${packageId}`,
    metadata: {
      packageId,
      before: JSON.stringify(
        prior
          ? {
              individualCap: Number(prior.individualCap),
              familyCap: prior.familyCap == null ? null : Number(prior.familyCap),
            }
          : null,
      ),
      after: JSON.stringify({ individualCap, familyCap }),
    },
  });

  revalidatePath(`/packages/${packageId}`);
  return ok();
}
