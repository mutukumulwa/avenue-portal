import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PackageEditForm } from "./PackageEditForm";
import { ChangeControlPanel } from "./ChangeControlPanel";
import type { PackageVersionStatus } from "@/server/services/package-change-control.service";
import {
  describeArchiveImpact,
  getPackageArchiveImpact,
} from "@/server/services/package-archive-impact.service";
import { SharedLimitsManager } from "./SharedLimitsManager";
import { ProviderEligibilityManager } from "./ProviderEligibilityManager";
import { TreatmentExclusionsManager } from "./TreatmentExclusionsManager";
import { ReferralRulesManager } from "./ReferralRulesManager";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const { id } = await params;
  const pkg = await PackagesService.getPackageById(session.user.tenantId, id);
  if (!pkg) notFound();

  const benefits = pkg.currentVersion?.benefits ?? [];

  // UAT-HF P09.06 — DEF-025: resolved here so the operator sees which schemes
  // and how many members are affected BEFORE choosing Archived, rather than
  // being refused after the fact.
  const archiveImpact = await getPackageArchiveImpact(prisma, session.user.tenantId, id);

  // UAT-HF P09.04 (DEF-055): network rules now live on the DRAFT being edited,
  // so this screen must read the draft's rules — otherwise an operator adds a
  // rule and the list still shows the live version's set, which is exactly the
  // "nothing changed" the run reported.
  const workingDraft = await prisma.packageVersion.findFirst({
    where: { packageId: id, status: "DRAFT" },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });

  const versionId = pkg.currentVersion?.id ?? "";
  const ruleVersionId = workingDraft?.id ?? versionId;
  const [sharedLimits, eligibilityRules, allProviders, treatmentExclusions, referralRules] = await Promise.all([
    prisma.sharedLimitGroup.findMany({
      where: { packageVersionId: versionId },
      include: { benefitConfigs: { include: { benefitConfig: true } } },
    }),
    prisma.packageProviderEligibility.findMany({
      where: { packageVersionId: ruleVersionId },
      include: { provider: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.provider.findMany({
      where: { tenantId: session.user.tenantId, contractStatus: "ACTIVE" },
      select: { id: true, name: true, tier: true },
      orderBy: { name: "asc" },
    }),
    prisma.treatmentExclusionRule.findMany({
      where: { packageVersionId: versionId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referralRule.findMany({
      where: { packageVersionId: versionId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/packages/${id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Edit Package</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">{pkg.name}</p>
        </div>
      </div>

      {/* Core package form — a self-contained <form> (NOT wrapping the managers,
          which each own their own <form>; nested forms were the DEF-026 bug). */}
      {/* UAT-HF P09.01 — DEF-024. Where this change is, and what has to happen
          for it to reach a member. The run found "no approval requested, no
          Draft/Pending/Approved state, and no feedback message of any kind". */}
      <ChangeControlPanel
        packageId={id}
        viewerId={session.user.id}
        versions={pkg.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          status: v.status as PackageVersionStatus,
          effectiveFrom: v.effectiveFrom.toISOString(),
          submittedById: v.submittedById,
          isCurrent: v.id === pkg.currentVersionId,
        }))}
      />

      <PackageEditForm
        packageId={id}
        impact={{
          summary: describeArchiveImpact(archiveImpact, pkg.name),
          inUse: archiveImpact.inUse,
          schemes: archiveImpact.schemes.map((s) => ({
            id: s.id,
            name: s.name,
            ...(s.tierName ? { tierName: s.tierName } : {}),
          })),
        }}
        pkg={{
          name: pkg.name,
          description: pkg.description ?? null,
          status: pkg.status,
          type: pkg.type,
          annualLimit: Number(pkg.annualLimit),
          contributionAmount: Number(pkg.contributionAmount),
          minAge: pkg.minAge,
          maxAge: pkg.maxAge,
          dependentMaxAge: pkg.dependentMaxAge,
          versionNumber: pkg.currentVersion?.versionNumber ?? 1,
        }}
        benefits={benefits.map((b) => ({
          category: b.category,
          annualSubLimit: Number(b.annualSubLimit),
          copayPercentage: Number(b.copayPercentage),
          waitingPeriodDays: b.waitingPeriodDays,
          perVisitLimit: b.perVisitLimit == null ? null : Number(b.perVisitLimit),
        }))}
      />

      {pkg.currentVersion && (
        <ProviderEligibilityManager
          packageId={id}
          draftVersionNumber={workingDraft?.versionNumber ?? null}
          liveVersionNumber={pkg.currentVersion.versionNumber ?? null}
          initialRules={eligibilityRules.map((r) => ({
            id: r.id,
            inclusionType: r.inclusionType as "INCLUDE" | "EXCLUDE",
            providerId: r.providerId,
            providerTier: r.providerTier,
            providerName: r.provider?.name ?? null,
            // P09.05 — the manager applies the SAME precedence the evaluator
            // does, so it needs the same inputs. A second ranking implemented in
            // the UI is a second chance to disagree, which is DEF-054.
            priority: r.priority,
            effectiveFrom: r.effectiveFrom,
            effectiveTo: r.effectiveTo,
            isActive: r.isActive,
          }))}
          availableProviders={allProviders.map((p) => ({
            id: p.id,
            name: p.name,
            tier: p.tier,
          }))}
        />
      )}

      {pkg.currentVersion && (
        <SharedLimitsManager
          packageVersionId={pkg.currentVersion.id}
          availableBenefits={benefits.map((b) => ({
            id: b.id,
            category: b.category,
            customCategoryName: b.customCategoryName ?? null,
          }))}
          initialLimits={sharedLimits.map((sl) => ({
            id: sl.id,
            name: sl.name,
            limitAmount: Number(sl.limitAmount),
            appliesTo: sl.appliesTo as "MEMBER" | "FAMILY",
            benefitConfigs: sl.benefitConfigs.map((bc) => ({
              benefitConfigId: bc.benefitConfigId,
              category: bc.benefitConfig.category,
            })),
          }))}
        />
      )}

      {pkg.currentVersion && (
        <TreatmentExclusionsManager
          packageVersionId={pkg.currentVersion.id}
          initialRules={treatmentExclusions.map((ex) => ({
            id: ex.id,
            ruleCategory: ex.ruleCategory,
            exclusionType: ex.exclusionType,
            benefitCategories: ex.benefitCategories,
            serviceCodes: ex.serviceCodes,
            diagnosisCodes: ex.diagnosisCodes,
            procedureCodes: ex.procedureCodes,
            exceptionType:
              ex.exceptionLogic && typeof ex.exceptionLogic === "object" && "type" in ex.exceptionLogic
                ? String((ex.exceptionLogic as { type: string }).type)
                : null,
            effectiveFrom: ex.effectiveFrom.toISOString(),
            effectiveTo: ex.effectiveTo ? ex.effectiveTo.toISOString() : null,
            sourceClause: ex.sourceClause,
            internalNote: ex.internalNote,
            memberSafeExplanation: ex.memberSafeExplanation,
          }))}
        />
      )}

      {pkg.currentVersion && (
        <ReferralRulesManager
          packageVersionId={pkg.currentVersion.id}
          initialRules={referralRules.map((r) => ({
            id: r.id,
            benefitCategories: r.benefitCategories,
            serviceCodes: r.serviceCodes,
            providerSpecialties: r.providerSpecialties,
            requiresReferral: r.requiresReferral,
            emergencyException: r.emergencyException,
            effectiveFrom: r.effectiveFrom.toISOString(),
            effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
            sourceClause: r.sourceClause,
            memberSafeExplanation: r.memberSafeExplanation,
          }))}
        />
      )}
    </div>
  );
}
