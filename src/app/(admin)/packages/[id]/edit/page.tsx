import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PackageEditForm } from "./PackageEditForm";
import { SharedLimitsManager } from "./SharedLimitsManager";
import { ProviderEligibilityManager } from "./ProviderEligibilityManager";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const { id } = await params;
  const pkg = await PackagesService.getPackageById(session.user.tenantId, id);
  if (!pkg) notFound();

  const benefits = pkg.currentVersion?.benefits ?? [];

  const versionId = pkg.currentVersion?.id ?? "";
  const [sharedLimits, eligibilityRules, allProviders] = await Promise.all([
    prisma.sharedLimitGroup.findMany({
      where: { packageVersionId: versionId },
      include: { benefitConfigs: { include: { benefitConfig: true } } },
    }),
    prisma.packageProviderEligibility.findMany({
      where: { packageVersionId: versionId },
      include: { provider: { select: { name: true } } },
    }),
    prisma.provider.findMany({
      where: { tenantId: session.user.tenantId, contractStatus: "ACTIVE" },
      select: { id: true, name: true, tier: true },
      orderBy: { name: "asc" },
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
      <PackageEditForm
        packageId={id}
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
          packageVersionId={pkg.currentVersion.id}
          initialRules={eligibilityRules.map((r) => ({
            id: r.id,
            inclusionType: r.inclusionType as "INCLUDE" | "EXCLUDE",
            providerId: r.providerId,
            providerTier: r.providerTier,
            providerName: r.provider?.name ?? null,
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
    </div>
  );
}
