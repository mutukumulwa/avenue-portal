"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import {
  BENEFIT_CATEGORY_VALUES,
  packageCoreSchema,
  packageBenefitInputSchema,
  FIELD_LABELS,
} from "@/lib/validation/package";
import { sharedLimitSchema } from "@/lib/validation/shared-limit";
import {
  treatmentExclusionSchema,
  resolveExclusionOwner,
  detectExclusionOverlap,
} from "@/lib/validation/exclusion";
import { referralRuleSchema, detectReferralOverlap } from "@/lib/validation/referral";
import { conflictIfAdded } from "@/lib/provider-precedence";
import {
  ARCHIVE_ACKNOWLEDGEMENT_FIELD,
  describeArchiveImpact,
  getPackageArchiveImpact,
} from "@/server/services/package-archive-impact.service";

/** Local P2002 detector (the settings/tenants copy lives in a `"use server"`
 *  file and can't be imported). SP-5: map the unique-constraint race to a
 *  friendly ActionResult instead of a raw 500. */
function isP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** Revalidate every surface a package-config change can be seen on: the detail
 *  page, its edit screen, the list, and the member benefits surface (stale
 *  terms shown to members was an explicit DEF-021/C5 finding). */
function revalidatePackageSurfaces(packageId: string): void {
  revalidatePath(`/packages/${packageId}`);
  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath("/packages");
  revalidatePath("/member/benefits");
}

/**
 * WP-2.0 — edit a package. Every save mints a NEW immutable `PackageVersion`.
 *
 * Fixes bundled here (all verified open at 39bb24e):
 *   - validation: money/percent/age/cross-field bounds on core + every benefit
 *     row, via the canonical schema. Returns SP-2 field errors (no throw / no
 *     redirect-on-error); redirect only on success, outside try/catch.
 *   - orphaning: copy-forward the current version's SharedLimitGroups AND
 *     PackageProviderEligibility rows into the new version (re-mapping the
 *     shared-limit benefit links by category to the new BenefitConfig ids), so a
 *     benefit edit no longer silently strands every pool + provider rule on the
 *     old version.
 *   - data loss: carry forward each benefit's non-edited fields (funding, cost-
 *     share, exclusions, notes) rather than blanking them.
 *   - version numbering: nextVersion = MAX(versionNumber)+1 (was
 *     currentVersion.versionNumber+1 → P2002 500 when the pointer wasn't latest).
 *   - audit: PACKAGE_VERSION_CREATE with before/after.
 */
export async function updatePackageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const packageId = formData.get("packageId") as string;
  if (!packageId) return fail(undefined, "Package is required.");

  // 1) Core fields.
  const coreParsed = packageCoreSchema.safeParse({
    name: (formData.get("name") ?? "") as string,
    type: formData.get("type"),
    status: formData.get("status"),
    description: (formData.get("description") as string) || null,
    annualLimit: formData.get("annualLimit"),
    contributionAmount: formData.get("contributionAmount"),
    minAge: formData.get("minAge"),
    maxAge: formData.get("maxAge"),
    dependentMaxAge: formData.get("dependentMaxAge"),
  });
  const fieldErrors: Record<string, string[]> = {};
  if (!coreParsed.success) Object.assign(fieldErrors, coreParsed.error.flatten().fieldErrors);

  // 2) Enabled benefit rows (validate each; key errors to the per-category
  //    input names so the form renders them adjacent to the offending cell).
  const enabledCats = BENEFIT_CATEGORY_VALUES.filter(
    (cat) => formData.get(`benefit_enabled_${cat}`) === "on",
  );
  const benefits: {
    category: (typeof BENEFIT_CATEGORY_VALUES)[number];
    annualSubLimit: number;
    copayPercentage: number;
    waitingPeriodDays: number;
    perVisitLimit: number | null;
  }[] = [];
  for (const cat of enabledCats) {
    const rawPerVisit = formData.get(`benefit_pervisit_${cat}`);
    const rowParsed = packageBenefitInputSchema.safeParse({
      category: cat,
      annualSubLimit: formData.get(`benefit_limit_${cat}`),
      copayPercentage: formData.get(`benefit_copay_${cat}`) ?? undefined,
      waitingPeriodDays: formData.get(`benefit_wait_${cat}`) ?? undefined,
      perVisitLimit: rawPerVisit == null || rawPerVisit === "" ? null : rawPerVisit,
    });
    if (!rowParsed.success) {
      const e = rowParsed.error.flatten().fieldErrors;
      if (e.annualSubLimit) fieldErrors[`benefit_limit_${cat}`] = e.annualSubLimit;
      if (e.copayPercentage) fieldErrors[`benefit_copay_${cat}`] = e.copayPercentage;
      if (e.waitingPeriodDays) fieldErrors[`benefit_wait_${cat}`] = e.waitingPeriodDays;
      if (e.perVisitLimit) fieldErrors[`benefit_pervisit_${cat}`] = e.perVisitLimit;
      continue;
    }
    // Cross-field: a benefit sub-limit may not exceed the package annual limit.
    if (coreParsed.success && rowParsed.data.annualSubLimit > coreParsed.data.annualLimit) {
      fieldErrors[`benefit_limit_${cat}`] = [
        `${FIELD_LABELS.annualSubLimit} cannot exceed the package ${FIELD_LABELS.annualLimit.toLowerCase()}.`,
      ];
      continue;
    }
    benefits.push({
      category: cat,
      annualSubLimit: rowParsed.data.annualSubLimit,
      copayPercentage: rowParsed.data.copayPercentage ?? 0,
      waitingPeriodDays: rowParsed.data.waitingPeriodDays ?? 0,
      perVisitLimit: rowParsed.data.perVisitLimit ?? null,
    });
  }

  if (Object.keys(fieldErrors).length > 0 || !coreParsed.success) return fail(fieldErrors);
  const core = coreParsed.data;

  // 3) Load the package with everything the new version must inherit.
  const pkg = await prisma.package.findUnique({
    where: { id: packageId, tenantId },
    include: {
      currentVersion: {
        include: {
          benefits: true,
          sharedLimitGroups: { include: { benefitConfigs: true } },
          eligibilityRules: true,
          treatmentExclusions: true,
          referralRules: true,
        },
      },
    },
  });
  if (!pkg) notFound();

  // ── UAT-HF P09.06 — DEF-025 ────────────────────────────────────────────────
  // "Repeating the selection on a package that an ACTIVE scheme is bound to
  // produced no dependency warning of any kind — nothing indicates the package
  // is in use or which scheme would be affected."
  //
  // Archiving is refused unless the operator has been shown the impact and
  // acknowledged it. The check is here, on the server, so it holds for a
  // hand-crafted POST as well as for the form — and it only bites on the
  // transition INTO archived, so re-saving an already-archived package is not
  // obstructed.
  if (core.status === "ARCHIVED" && pkg.status !== "ARCHIVED") {
    const impact = await getPackageArchiveImpact(prisma, tenantId, packageId);
    const acknowledged = formData.get(ARCHIVE_ACKNOWLEDGEMENT_FIELD) === "yes";
    if (impact.inUse && !acknowledged) {
      return fail(
        { status: [describeArchiveImpact(impact, pkg.name)] },
        "Archiving was not applied. Confirm the effect on the schemes below first.",
      );
    }
    await writeAudit({
      userId: session.user.id,
      action: "PACKAGE_ARCHIVED",
      module: "PACKAGES",
      description: `Package archived: ${pkg.name}`,
      metadata: {
        packageId,
        schemesAffected: impact.schemes.length,
        membersAffected: impact.memberCount,
        acknowledgedInUse: acknowledged,
      },
    });
  }
  const oldVersion = pkg.currentVersion;

  // 4) nextVersion from MAX — never the (possibly non-latest) current pointer.
  const agg = await prisma.packageVersion.aggregate({
    where: { packageId },
    _max: { versionNumber: true },
  });
  const nextVersion = (agg._max.versionNumber ?? 0) + 1;

  // Preserve each benefit's non-edited fields across the version bump.
  const oldByCat = new Map((oldVersion?.benefits ?? []).map((b) => [b.category, b]));
  const newBenefitData = benefits.map((b) => {
    const prev = oldByCat.get(b.category);
    return {
      category: b.category,
      annualSubLimit: b.annualSubLimit,
      perVisitLimit: b.perVisitLimit,
      copayPercentage: b.copayPercentage,
      waitingPeriodDays: b.waitingPeriodDays,
      customCategoryName: prev?.customCategoryName ?? null,
      coInsurancePct: prev?.coInsurancePct ?? 0,
      deductibleAmount: prev?.deductibleAmount ?? 0,
      fundingModel: prev?.fundingModel ?? "FEE_FOR_SERVICE",
      fundingOverrides: prev?.fundingOverrides ?? undefined,
      notes: prev?.notes ?? null,
      exclusions: prev?.exclusions ?? [],
    };
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.package.update({
        where: { id: packageId, tenantId },
        data: {
          name: core.name,
          description: core.description ?? null,
          annualLimit: core.annualLimit,
          contributionAmount: core.contributionAmount,
          minAge: core.minAge,
          maxAge: core.maxAge,
          dependentMaxAge: core.dependentMaxAge,
          type: core.type,
          status: core.status,
        },
      });

      const newVersion = await tx.packageVersion.create({
        data: {
          packageId,
          versionNumber: nextVersion,
          effectiveFrom: new Date(),
          benefits: { create: newBenefitData },
          // P09.01: born a DRAFT, recording who made it so the checker can be
          // required to be somebody else (DEC-03).
          status: "DRAFT",
          submittedById: session.user.id,
          submittedAt: new Date(),
        },
        include: { benefits: { select: { id: true, category: true } } },
      });

      // category → new BenefitConfig id (one config per category per version).
      const newIdByCat = new Map(newVersion.benefits.map((b) => [b.category, b.id]));

      // Copy-forward shared-limit groups, re-mapping their benefit links.
      for (const grp of oldVersion?.sharedLimitGroups ?? []) {
        const remapped: string[] = [];
        for (const link of grp.benefitConfigs) {
          const oldB = (oldVersion?.benefits ?? []).find((b) => b.id === link.benefitConfigId);
          const newId = oldB ? newIdByCat.get(oldB.category) : undefined;
          if (newId) remapped.push(newId);
        }
        if (remapped.length === 0) continue; // all its benefits were removed
        const newGrp = await tx.sharedLimitGroup.create({
          data: {
            packageVersionId: newVersion.id,
            name: grp.name,
            limitAmount: grp.limitAmount,
            appliesTo: grp.appliesTo,
          },
        });
        await tx.benefitConfigSharedLimit.createMany({
          data: remapped.map((id) => ({ sharedLimitGroupId: newGrp.id, benefitConfigId: id })),
        });
      }

      // Copy-forward provider eligibility rules (keyed only to the version).
      for (const rule of oldVersion?.eligibilityRules ?? []) {
        await tx.packageProviderEligibility.create({
          data: {
            packageVersionId: newVersion.id,
            providerId: rule.providerId,
            providerTier: rule.providerTier,
            inclusionType: rule.inclusionType,
          },
        });
      }

      // Copy-forward treatment exclusions (WP-2.3) — scope is by code sets +
      // benefit categories, so no id re-mapping is needed (unlike shared limits).
      // Only the version-owned rows are carried (contract-owned rows belong to
      // the contract, not the package version). Historical rows stay immutable.
      for (const ex of oldVersion?.treatmentExclusions ?? []) {
        await tx.treatmentExclusionRule.create({
          data: {
            tenantId,
            packageVersionId: newVersion.id,
            ruleCategory: ex.ruleCategory,
            exclusionType: ex.exclusionType,
            benefitCategories: ex.benefitCategories,
            serviceCodes: ex.serviceCodes,
            diagnosisCodes: ex.diagnosisCodes,
            procedureCodes: ex.procedureCodes,
            exceptionLogic: ex.exceptionLogic ?? undefined,
            effectiveFrom: ex.effectiveFrom,
            effectiveTo: ex.effectiveTo,
            sourceClause: ex.sourceClause,
            internalNote: ex.internalNote,
            memberSafeExplanation: ex.memberSafeExplanation,
            isActive: ex.isActive,
          },
        });
      }

      // Copy-forward referral rules (WP-2.4).
      for (const ref of oldVersion?.referralRules ?? []) {
        await tx.referralRule.create({
          data: {
            tenantId,
            packageVersionId: newVersion.id,
            benefitCategories: ref.benefitCategories,
            serviceCodes: ref.serviceCodes,
            providerSpecialties: ref.providerSpecialties,
            requiresReferral: ref.requiresReferral,
            emergencyException: ref.emergencyException,
            effectiveFrom: ref.effectiveFrom,
            effectiveTo: ref.effectiveTo,
            sourceClause: ref.sourceClause,
            memberSafeExplanation: ref.memberSafeExplanation,
            isActive: ref.isActive,
          },
        });
      }

      // ── UAT-HF P09.01 — DEF-024 ──────────────────────────────────────────
      // This line was the defect. Creating a version and pointing live
      // eligibility at it were ONE act, so "a single underwriter changed a live
      // ACTIVE package ... and the change took effect immediately as version v5
      // 'Current', with no approval requested".
      //
      // They are two acts now, and only the second is governed. The new version
      // is a DRAFT: `Package.currentVersionId` still points at the approved one,
      // so no member's eligibility moved. That is the acceptance — "maker save
      // cannot change live member eligibility" — and it holds structurally,
      // because nothing points at a draft.
      //
      // Activation happens in submitPackageVersionAction → approve, which routes
      // through the same ApprovalRequestService that already governs claim
      // payments (the engine the run found working, just never wired to config).
    });
  } catch (err) {
    if (isP2002(err)) {
      return fail(
        undefined,
        "This package was changed concurrently. Reopen the latest version and try again.",
      );
    }
    throw err;
  }

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_VERSION_CREATE",
    module: "PACKAGES",
    description: `Package ${packageId} edited → version ${nextVersion}`,
    metadata: {
      packageId,
      versionNumber: nextVersion,
      previousVersion: oldVersion?.versionNumber ?? null,
      benefitCount: benefits.length,
      copiedSharedLimits: (oldVersion?.sharedLimitGroups ?? []).length,
      copiedProviderRules: (oldVersion?.eligibilityRules ?? []).length,
      copiedExclusions: (oldVersion?.treatmentExclusions ?? []).length,
      copiedReferralRules: (oldVersion?.referralRules ?? []).length,
    },
  });

  revalidatePackageSurfaces(packageId);
  redirect(`/packages/${packageId}`);
}

// ── Shared Limits (WP-2.5) ──────────────────────────────────────────────────

export async function createSharedLimitAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const packageVersionId = formData.get("packageVersionId") as string;

  const parsed = sharedLimitSchema.safeParse({
    name: (formData.get("name") ?? "") as string,
    limitAmount: formData.get("limitAmount"),
    appliesTo: formData.get("appliesTo"),
    benefitConfigIds: formData.getAll("benefitConfigIds").map(String),
  });
  if (!parsed.success) return fail(parsed.error.flatten().fieldErrors);
  const { name, limitAmount, appliesTo, benefitConfigIds } = parsed.data;

  // Resolve version → package → tenant ownership (client-supplied version id).
  const version = await prisma.packageVersion.findUnique({
    where: { id: packageVersionId },
    select: { packageId: true, package: { select: { tenantId: true } } },
  });
  if (!version || version.package.tenantId !== tenantId) {
    return fail(undefined, "Package version not found.");
  }
  const packageId = version.packageId;

  // Every submitted benefit id must belong to THIS version (tenant+pkg+version).
  const owned = await prisma.benefitConfig.findMany({
    where: { id: { in: benefitConfigIds }, packageVersionId },
    select: { id: true },
  });
  if (owned.length !== benefitConfigIds.length) {
    return fail({
      benefitConfigIds: ["One or more selected benefits are not part of this package version."],
    });
  }

  // Duplicate-group guard: same (case-insensitive) name within the version.
  const dup = await prisma.sharedLimitGroup.findFirst({
    where: { packageVersionId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (dup) {
    return fail({ name: ["A shared limit group with this name already exists for this version."] });
  }

  // Atomic: group + links together (no half-created pool).
  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.sharedLimitGroup.create({
      data: { packageVersionId, name, limitAmount, appliesTo },
    });
    await tx.benefitConfigSharedLimit.createMany({
      data: benefitConfigIds.map((id) => ({ sharedLimitGroupId: g.id, benefitConfigId: id })),
    });
    return g;
  });

  await writeAudit({
    userId: session.user.id,
    action: "SHARED_LIMIT_CREATE",
    module: "PACKAGES",
    description: `Shared limit "${name}" created on package ${packageId}`,
    metadata: {
      packageId,
      packageVersionId,
      sharedLimitGroupId: group.id,
      appliesTo,
      limitAmount: String(limitAmount),
      benefitCount: benefitConfigIds.length,
    },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
  revalidatePath("/member/benefits");
  return ok();
}

export async function deleteSharedLimitAction(id: string): Promise<void> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const grp = await prisma.sharedLimitGroup.findUnique({
    where: { id },
    select: {
      name: true,
      packageVersion: { select: { packageId: true, package: { select: { tenantId: true } } } },
    },
  });
  if (!grp || grp.packageVersion.package.tenantId !== tenantId) return; // tenant-scoped no-op
  const packageId = grp.packageVersion.packageId;

  await prisma.$transaction(async (tx) => {
    await tx.benefitConfigSharedLimit.deleteMany({ where: { sharedLimitGroupId: id } });
    await tx.sharedLimitGroup.delete({ where: { id } });
  });

  await writeAudit({
    userId: session.user.id,
    action: "SHARED_LIMIT_DELETE",
    module: "PACKAGES",
    description: `Shared limit "${grp.name}" deleted from package ${packageId}`,
    metadata: { packageId, sharedLimitGroupId: id },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
  revalidatePath("/member/benefits");
}

// ── Provider Eligibility ────────────────────────────────────────────────────

export async function createProviderEligibilityAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const packageVersionId = formData.get("packageVersionId") as string;
  const inclusionType = formData.get("inclusionType") as "INCLUDE" | "EXCLUDE";
  const providerId = (formData.get("providerId") as string) || null;
  const providerTier = (formData.get("providerTier") as string) || null;

  if (!providerId && !providerTier) {
    return fail({ providerId: ["Select a specific provider or a provider tier."] });
  }

  const version = await prisma.packageVersion.findUnique({
    where: { id: packageVersionId },
    select: { packageId: true, package: { select: { tenantId: true } } },
  });
  if (!version || version.package.tenantId !== tenantId) {
    return fail(undefined, "Package version not found.");
  }
  const packageId = version.packageId;

  if (providerId) {
    const prov = await prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true },
    });
    if (!prov) return fail({ providerId: ["Provider not found."] });
  }

  // P09.05 / DEC-04 (DEF-054): refuse a rule that would make the answer depend
  // on database return order. The ladder resolves a specific rule against a tier
  // rule on its own; what it cannot resolve is two rules of the SAME standing
  // pointing opposite ways, and saving that would leave an operator unable to
  // tell whether a hospital is payable — the exact complaint in the run.
  const siblings = await prisma.packageProviderEligibility.findMany({
    where: { packageVersionId },
    select: {
      id: true,
      providerId: true,
      providerTier: true,
      inclusionType: true,
      priority: true,
      effectiveFrom: true,
      effectiveTo: true,
      isActive: true,
    },
  });
  const clash = conflictIfAdded(siblings, {
    id: "__candidate__",
    inclusionType,
    providerId: providerId || null,
    providerTier: providerTier || null,
  });
  if (clash) {
    return fail(
      undefined,
      `This rule contradicts one already saved and neither would win. ${clash.message}`,
    );
  }

  const rule = await prisma.packageProviderEligibility.create({
    data: {
      packageVersionId,
      inclusionType,
      providerId: providerId || null,
      providerTier: (providerTier as never) || null,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_PROVIDER_ELIGIBILITY_CREATE",
    module: "PACKAGES",
    description: `Provider eligibility rule (${inclusionType}) added to package ${packageId}`,
    metadata: {
      packageId,
      packageVersionId,
      ruleId: rule.id,
      inclusionType,
      providerId: providerId ?? null,
      providerTier: providerTier ?? null,
    },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
  return ok();
}

export async function deleteProviderEligibilityAction(id: string): Promise<void> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const rule = await prisma.packageProviderEligibility.findUnique({
    where: { id },
    select: {
      inclusionType: true,
      packageVersion: { select: { packageId: true, package: { select: { tenantId: true } } } },
    },
  });
  if (!rule || rule.packageVersion.package.tenantId !== tenantId) return; // tenant-scoped no-op
  const packageId = rule.packageVersion.packageId;

  await prisma.packageProviderEligibility.delete({ where: { id } });

  await writeAudit({
    userId: session.user.id,
    action: "PACKAGE_PROVIDER_ELIGIBILITY_DELETE",
    module: "PACKAGES",
    description: `Provider eligibility rule (${rule.inclusionType}) removed from package ${packageId}`,
    metadata: { packageId, ruleId: id },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
}

// ── Treatment Exclusions (WP-2.3 / DEF-023) ──────────────────────────────────

/** Build the structured exceptionLogic object from the form (CONDITIONAL only).
 *  Returns null for ABSOLUTE rules or when no exception is chosen. */
function parseExceptionLogic(formData: FormData): unknown {
  if (formData.get("exclusionType") !== "CONDITIONAL") return null;
  const type = (formData.get("exceptionType") as string) || "NONE";
  if (type === "NONE") return null;
  if (type === "RECONSTRUCTIVE_AFTER_TRAUMA") {
    return {
      type,
      triggerProcedureCodes: formData.getAll("exceptionTriggerProcedureCodes").map(String),
      triggerDiagnosisCodes: formData.getAll("exceptionTriggerDiagnosisCodes").map(String),
      requiresPriorCoveredTrauma: formData.get("exceptionRequiresPriorTrauma") === "on",
    };
  }
  if (type === "DIAGNOSIS_PRESENT") {
    return { type, diagnosisCodes: formData.getAll("exceptionDiagnosisCodes").map(String) };
  }
  if (type === "PROCEDURE_PRESENT") {
    return { type, procedureCodes: formData.getAll("exceptionProcedureCodes").map(String) };
  }
  return null;
}

export async function createTreatmentExclusionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const packageVersionId = (formData.get("packageVersionId") as string) || null;
  const providerContractId = (formData.get("providerContractId") as string) || null;

  const parsed = treatmentExclusionSchema.safeParse({
    ruleCategory: formData.get("ruleCategory"),
    exclusionType: formData.get("exclusionType"),
    benefitCategories: formData.getAll("benefitCategories").map(String),
    serviceCodes: formData.getAll("serviceCodes").map(String),
    diagnosisCodes: formData.getAll("diagnosisCodes").map(String),
    procedureCodes: formData.getAll("procedureCodes").map(String),
    exceptionLogic: parseExceptionLogic(formData),
    effectiveFrom: (formData.get("effectiveFrom") as string) || undefined,
    effectiveTo: (formData.get("effectiveTo") as string) || null,
    sourceClause: (formData.get("sourceClause") as string) || null,
    internalNote: (formData.get("internalNote") as string) || null,
    memberSafeExplanation: (formData.get("memberSafeExplanation") ?? "") as string,
  });
  if (!parsed.success) return fail(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // N-012: exactly one owner (package version OR provider contract).
  const ownerRes = resolveExclusionOwner({ packageVersionId, providerContractId });
  if (!ownerRes.ok) return fail(undefined, ownerRes.message);
  const owner = ownerRes.owner;

  // Tenant-ownership of the owner (client-supplied id) + resolve packageId.
  let packageId: string | null = null;
  if ("packageVersionId" in owner) {
    const version = await prisma.packageVersion.findUnique({
      where: { id: owner.packageVersionId },
      select: { packageId: true, package: { select: { tenantId: true } } },
    });
    if (!version || version.package.tenantId !== tenantId) {
      return fail(undefined, "Package version not found.");
    }
    packageId = version.packageId;
  } else {
    const contract = await prisma.providerContract.findFirst({
      where: { id: owner.providerContractId, tenantId },
      select: { id: true },
    });
    if (!contract) return fail(undefined, "Provider contract not found.");
  }

  // Overlap/conflict among the same owner's active rules.
  const existing = await prisma.treatmentExclusionRule.findMany({
    where:
      "packageVersionId" in owner
        ? { packageVersionId: owner.packageVersionId, isActive: true }
        : { providerContractId: owner.providerContractId, isActive: true },
    select: {
      id: true,
      ruleCategory: true,
      benefitCategories: true,
      serviceCodes: true,
      diagnosisCodes: true,
      procedureCodes: true,
      effectiveFrom: true,
      effectiveTo: true,
      isActive: true,
    },
  });
  const conflict = detectExclusionOverlap(existing, {
    ruleCategory: data.ruleCategory,
    benefitCategories: data.benefitCategories,
    serviceCodes: data.serviceCodes,
    diagnosisCodes: data.diagnosisCodes,
    procedureCodes: data.procedureCodes,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: data.effectiveTo ?? null,
  });
  if (conflict) {
    return fail({
      effectiveFrom: [
        "This exclusion overlaps an existing rule of the same category and scope for an overlapping period.",
      ],
    });
  }

  const rule = await prisma.treatmentExclusionRule.create({
    data: {
      tenantId,
      ...owner,
      ruleCategory: data.ruleCategory,
      exclusionType: data.exclusionType,
      benefitCategories: data.benefitCategories,
      serviceCodes: data.serviceCodes,
      diagnosisCodes: data.diagnosisCodes,
      procedureCodes: data.procedureCodes,
      exceptionLogic: (data.exceptionLogic ?? undefined) as never,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      sourceClause: data.sourceClause ?? null,
      internalNote: data.internalNote ?? null,
      memberSafeExplanation: data.memberSafeExplanation,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "TREATMENT_EXCLUSION_CREATE",
    module: "PACKAGES",
    description: `Treatment exclusion (${data.ruleCategory}/${data.exclusionType}) added`,
    metadata: {
      packageVersionId: packageVersionId ?? null,
      providerContractId: providerContractId ?? null,
      ruleId: rule.id,
      ruleCategory: data.ruleCategory,
      exclusionType: data.exclusionType,
    },
  });

  if (packageId) {
    revalidatePath(`/packages/${packageId}/edit`);
    revalidatePath(`/packages/${packageId}`);
    revalidatePath("/member/benefits");
  }
  return ok();
}

export async function deleteTreatmentExclusionAction(id: string): Promise<void> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const rule = await prisma.treatmentExclusionRule.findUnique({
    where: { id },
    select: {
      tenantId: true,
      ruleCategory: true,
      packageVersion: { select: { packageId: true } },
    },
  });
  if (!rule || rule.tenantId !== tenantId) return; // tenant-scoped no-op
  const packageId = rule.packageVersion?.packageId ?? null;

  await prisma.treatmentExclusionRule.delete({ where: { id } });

  await writeAudit({
    userId: session.user.id,
    action: "TREATMENT_EXCLUSION_DELETE",
    module: "PACKAGES",
    description: `Treatment exclusion (${rule.ruleCategory}) removed`,
    metadata: { ruleId: id, packageId },
  });

  if (packageId) {
    revalidatePath(`/packages/${packageId}/edit`);
    revalidatePath(`/packages/${packageId}`);
    revalidatePath("/member/benefits");
  }
}

// ── Referral Rules (WP-2.4 / DEF-024) ────────────────────────────────────────

export async function createReferralRuleAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const packageVersionId = formData.get("packageVersionId") as string;

  const parsed = referralRuleSchema.safeParse({
    benefitCategories: formData.getAll("benefitCategories").map(String),
    serviceCodes: formData.getAll("serviceCodes").map(String),
    providerSpecialties: formData.getAll("providerSpecialties").map(String),
    requiresReferral: formData.get("requiresReferral") === "on",
    emergencyException: formData.get("emergencyException") === "on",
    effectiveFrom: (formData.get("effectiveFrom") as string) || undefined,
    effectiveTo: (formData.get("effectiveTo") as string) || null,
    sourceClause: (formData.get("sourceClause") as string) || null,
    memberSafeExplanation: (formData.get("memberSafeExplanation") ?? "") as string,
  });
  if (!parsed.success) return fail(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // Tenant-ownership on the client-supplied version id.
  const version = await prisma.packageVersion.findUnique({
    where: { id: packageVersionId },
    select: { packageId: true, package: { select: { tenantId: true } } },
  });
  if (!version || version.package.tenantId !== tenantId) {
    return fail(undefined, "Package version not found.");
  }
  const packageId = version.packageId;

  // Overlap/conflict among the version's active referral rules.
  const existing = await prisma.referralRule.findMany({
    where: { packageVersionId, isActive: true },
    select: {
      id: true,
      benefitCategories: true,
      serviceCodes: true,
      providerSpecialties: true,
      effectiveFrom: true,
      effectiveTo: true,
      isActive: true,
    },
  });
  const conflict = detectReferralOverlap(existing, {
    benefitCategories: data.benefitCategories,
    serviceCodes: data.serviceCodes,
    providerSpecialties: data.providerSpecialties,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: data.effectiveTo ?? null,
  });
  if (conflict) {
    return fail({
      effectiveFrom: [
        "This referral rule overlaps an existing rule with the same scope for an overlapping period.",
      ],
    });
  }

  const rule = await prisma.referralRule.create({
    data: {
      tenantId,
      packageVersionId,
      benefitCategories: data.benefitCategories,
      serviceCodes: data.serviceCodes,
      providerSpecialties: data.providerSpecialties,
      requiresReferral: data.requiresReferral,
      emergencyException: data.emergencyException,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      sourceClause: data.sourceClause ?? null,
      memberSafeExplanation: data.memberSafeExplanation,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "REFERRAL_RULE_CREATE",
    module: "PACKAGES",
    description: `Referral rule added to package ${packageId}`,
    metadata: {
      packageId,
      packageVersionId,
      ruleId: rule.id,
      requiresReferral: data.requiresReferral,
      emergencyException: data.emergencyException,
    },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
  revalidatePath("/member/benefits");
  return ok();
}

export async function deleteReferralRuleAction(id: string): Promise<void> {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const rule = await prisma.referralRule.findUnique({
    where: { id },
    select: { tenantId: true, packageVersion: { select: { packageId: true } } },
  });
  if (!rule || rule.tenantId !== tenantId) return; // tenant-scoped no-op
  const packageId = rule.packageVersion.packageId;

  await prisma.referralRule.delete({ where: { id } });

  await writeAudit({
    userId: session.user.id,
    action: "REFERRAL_RULE_DELETE",
    module: "PACKAGES",
    description: `Referral rule removed from package ${packageId}`,
    metadata: { ruleId: id, packageId },
  });

  revalidatePath(`/packages/${packageId}/edit`);
  revalidatePath(`/packages/${packageId}`);
  revalidatePath("/member/benefits");
}
