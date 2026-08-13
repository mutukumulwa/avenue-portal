/**
 * UAT-HF P09.04 — network rules belong to a draft version (DEF-055).
 *
 * The run added two provider eligibility rules and found the package "at Current
 * v5 / Total Versions 5, unchanged, even though the same edit form states that
 * saving creates a new version — so there is no versioned record of the network
 * change."
 *
 * Two separate problems in that sentence:
 *
 * 1. **No versioned record.** Which hospitals a package pays for is coverage.
 *    Changing it without a version leaves nothing to point at afterwards — no
 *    before, no after, no author.
 * 2. **It took effect immediately.** The rule was written straight onto the
 *    ACTIVE version, so live member eligibility changed the moment Save was
 *    pressed. That is DEF-024's defect wearing different clothes, and P09.01
 *    already built the answer for benefits: edits land on a DRAFT, a different
 *    checker approves, activation moves the pointer.
 *
 * This module is how a network rule reaches that same machinery.
 *
 * ## One working draft, not one draft per rule
 *
 * An operator setting up a network adds several rules in a row. Minting a
 * version per rule would produce v6, v7, v8 for one act of configuration and
 * bury the real change history. So the draft is **get-or-create**: the first
 * rule opens it, the rest join it, and the whole set is approved together.
 *
 * ## Why the copy-forward lives here as well as in `updatePackageAction`
 *
 * Both need it, and extracting the benefits/shared-limit re-mapping out of that
 * action — the most heavily tested path in the package surface — is a refactor
 * with real regression risk that this task does not need to take. The two are
 * kept honest by `packageVersionId`-keyed round-trip tests rather than by
 * sharing one function today. The duplication is deliberate and bounded: this
 * copy carries the *rule* sets, and delegates benefit re-mapping by copying
 * benefit rows one-for-one (no category re-mapping is needed, because nothing
 * here edits benefits).
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface WorkingDraft {
  id: string;
  versionNumber: number;
  /** True when this call created it, so the caller can tell the operator. */
  created: boolean;
}

/**
 * The draft version a coverage edit should be written to, creating it if needed.
 *
 * Returns the existing DRAFT when the package already has one — including one
 * opened by the benefits form — so a session of edits accumulates into a single
 * reviewable change rather than a pile of versions.
 *
 * A REJECTED version is deliberately NOT reused: it has been seen and refused,
 * and silently reopening it would let a rejected change return without the
 * checker knowing. The maker moves it back to DRAFT explicitly, through the
 * change-control panel.
 */
export async function getOrCreateWorkingDraft(
  db: Db,
  input: { tenantId: string; packageId: string; userId: string },
): Promise<WorkingDraft> {
  const pkg = await db.package.findFirst({
    where: { id: input.packageId, tenantId: input.tenantId },
    select: { id: true, currentVersionId: true },
  });
  if (!pkg) throw new Error("Package not found");

  const existingDraft = await db.packageVersion.findFirst({
    where: { packageId: input.packageId, status: "DRAFT" },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
  if (existingDraft) {
    return { id: existingDraft.id, versionNumber: existingDraft.versionNumber, created: false };
  }

  const source = pkg.currentVersionId
    ? await db.packageVersion.findUnique({
        where: { id: pkg.currentVersionId },
        include: {
          benefits: true,
          sharedLimitGroups: { include: { benefitConfigs: true } },
          eligibilityRules: true,
          treatmentExclusions: true,
          referralRules: true,
        },
      })
    : null;

  // MAX + 1, read numerically. Version numbers are ints here, so this is safe —
  // unlike member numbers, where the same shape needed a sequence table (P05.02).
  const highest = await db.packageVersion.aggregate({
    where: { packageId: input.packageId },
    _max: { versionNumber: true },
  });
  const versionNumber = (highest._max.versionNumber ?? 0) + 1;

  const draft = await db.packageVersion.create({
    data: {
      packageId: input.packageId,
      versionNumber,
      effectiveFrom: new Date(),
      status: "DRAFT",
      submittedById: input.userId,
      submittedAt: new Date(),
      facilityAccess: source?.facilityAccess ?? [],
      pricingModelUrl: source?.pricingModelUrl ?? null,
      pricingConfig: source?.pricingConfig ?? undefined,
    },
    select: { id: true, versionNumber: true },
  });

  if (source) {
    // Benefits, one for one. Nothing in the network path edits a benefit, so no
    // category re-mapping is required — but the shared-limit links below are
    // keyed to BenefitConfig ids, so the new ids must be captured.
    const newBenefitIdByCategory = new Map<string, string>();
    for (const b of source.benefits) {
      const created = await db.benefitConfig.create({
        data: {
          packageVersionId: draft.id,
          category: b.category,
          customCategoryName: b.customCategoryName,
          annualSubLimit: b.annualSubLimit,
          perVisitLimit: b.perVisitLimit,
          copayPercentage: b.copayPercentage,
          coInsurancePct: b.coInsurancePct,
          deductibleAmount: b.deductibleAmount,
          fundingModel: b.fundingModel,
          fundingOverrides: b.fundingOverrides ?? undefined,
          waitingPeriodDays: b.waitingPeriodDays,
          notes: b.notes,
          exclusions: b.exclusions,
        },
        select: { id: true, category: true },
      });
      newBenefitIdByCategory.set(String(created.category), created.id);
    }

    for (const grp of source.sharedLimitGroups) {
      const remapped: string[] = [];
      for (const link of grp.benefitConfigs) {
        const oldBenefit = source.benefits.find((b) => b.id === link.benefitConfigId);
        const newId = oldBenefit ? newBenefitIdByCategory.get(String(oldBenefit.category)) : undefined;
        if (newId) remapped.push(newId);
      }
      if (remapped.length === 0) continue;
      const newGrp = await db.sharedLimitGroup.create({
        data: {
          packageVersionId: draft.id,
          name: grp.name,
          limitAmount: grp.limitAmount,
          appliesTo: grp.appliesTo,
        },
        select: { id: true },
      });
      await db.benefitConfigSharedLimit.createMany({
        data: remapped.map((id) => ({ sharedLimitGroupId: newGrp.id, benefitConfigId: id })),
      });
    }

    // Provider rules, WITH their precedence columns. P09.05 added priority,
    // effectiveFrom/To and isActive; a copy-forward that dropped them would
    // reset every priority to 0, discard every effective window and silently
    // reactivate a retired rule on the next version.
    for (const rule of source.eligibilityRules) {
      await db.packageProviderEligibility.create({
        data: {
          packageVersionId: draft.id,
          providerId: rule.providerId,
          providerTier: rule.providerTier,
          inclusionType: rule.inclusionType,
          priority: rule.priority,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
          isActive: rule.isActive,
        },
      });
    }

    for (const ex of source.treatmentExclusions) {
      await db.treatmentExclusionRule.create({
        data: {
          tenantId: input.tenantId,
          packageVersionId: draft.id,
          ruleCategory: ex.ruleCategory,
          exclusionType: ex.exclusionType,
          benefitCategories: ex.benefitCategories,
          serviceCodes: ex.serviceCodes,
          diagnosisCodes: ex.diagnosisCodes,
          procedureCodes: ex.procedureCodes,
          exceptionLogic: ex.exceptionLogic ?? undefined,
          effectiveFrom: ex.effectiveFrom,
          effectiveTo: ex.effectiveTo,
          isActive: ex.isActive,
          memberSafeExplanation: ex.memberSafeExplanation,
          sourceClause: ex.sourceClause,
          internalNote: ex.internalNote,
        },
      });
    }

    for (const ref of source.referralRules) {
      await db.referralRule.create({
        data: {
          tenantId: input.tenantId,
          packageVersionId: draft.id,
          benefitCategories: ref.benefitCategories,
          serviceCodes: ref.serviceCodes,
          providerSpecialties: ref.providerSpecialties,
          requiresReferral: ref.requiresReferral,
          emergencyException: ref.emergencyException,
          effectiveFrom: ref.effectiveFrom,
          effectiveTo: ref.effectiveTo,
          isActive: ref.isActive,
          memberSafeExplanation: ref.memberSafeExplanation,
          sourceClause: ref.sourceClause,
        },
      });
    }
  }

  return { id: draft.id, versionNumber: draft.versionNumber, created: true };
}
