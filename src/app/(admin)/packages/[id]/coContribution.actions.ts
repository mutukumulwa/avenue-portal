"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { capsSchema, coContributionRuleSchema } from "@/lib/validation/co-contribution";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/** Optional numeric form field: absent/blank → null (so coercion never turns
 *  "" into 0 and trips a positive() check); otherwise the raw string for zod. */
function optionalNumber(v: FormDataEntryValue | null): string | null {
  return v == null || v === "" ? null : String(v);
}

export async function createCoContributionRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.UNDERWRITING);

  const packageId = formData.get("packageId") as string;
  if (!packageId) return { error: "Missing required fields." };

  // Canonical validation (WP-2.0): percent 0–100, money finite/≥0/≤2dp, and the
  // type↔amount cross-field rule. Previously `percentage=500` and a negative
  // `fixedAmount`/`perVisitCap` persisted from this door.
  const parsed = coContributionRuleSchema.safeParse({
    benefitCategory: (formData.get("benefitCategory") as string) || null,
    networkTier: formData.get("networkTier"),
    type: formData.get("type"),
    fixedAmount: optionalNumber(formData.get("fixedAmount")),
    percentage: optionalNumber(formData.get("percentage")),
    perVisitCap: optionalNumber(formData.get("perVisitCap")),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first =
      Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? "Invalid co-contribution rule.";
    return { error: first };
  }
  const { benefitCategory, networkTier, type, fixedAmount, percentage, perVisitCap } = parsed.data;

  // Verify package belongs to this tenant
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { tenantId: true } });
  if (!pkg || pkg.tenantId !== session.user.tenantId) return { error: "Package not found." };

  const rule = await prisma.coContributionRule.create({
    data: {
      packageId,
      tenantId: session.user.tenantId,
      benefitCategory: (benefitCategory as never) ?? null,
      networkTier: networkTier as never,
      type: type as never,
      fixedAmount: fixedAmount ?? null,
      percentage: percentage ?? null,
      perVisitCap: perVisitCap ?? null,
      effectiveFrom: new Date(),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_COCONTRIBUTION_RULE_CREATE",
    module: "PACKAGES",
    description: `Co-contribution rule (${type} / ${networkTier}) added to package ${packageId}`,
    metadata: {
      packageId,
      ruleId: rule.id,
      type,
      networkTier,
      benefitCategory: benefitCategory ?? null,
      percentage: percentage ?? null,
      fixedAmount: fixedAmount ?? null,
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
