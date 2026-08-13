import { requireRole, ROLES, type UserRole } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, Shield, Pencil, Percent, Activity, Users } from "lucide-react";
import { CoContributionRulesManager } from "./CoContributionRulesManager";
import { formatMoney } from "@/lib/utils";

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // DEF-004 / D2: READ-ONLY discovery for the Membership Officer; Edit and the
  // co-contribution manager stay UNDERWRITING (X-002).
  const session = await requireRole(ROLES.PACKAGE_READ);
  const canWrite = ROLES.UNDERWRITING.includes(session.user.role as UserRole);

  const { id } = await params;
  const [pkg, coRules, annualCap] = await Promise.all([
    PackagesService.getPackageById(session.user.tenantId, id),
    prisma.coContributionRule.findMany({
      where: { packageId: id },
      orderBy: [{ benefitCategory: "asc" }, { networkTier: "asc" }],
    }),
    prisma.annualCoContributionCap.findUnique({ where: { packageId: id } }),
  ]);
  if (!pkg) notFound();

  // Shared-limit pools on the CURRENT version (WP-2.5: pools are version-owned
  // and must appear in the immutable version display).
  const sharedLimits = pkg.currentVersion
    ? await prisma.sharedLimitGroup.findMany({
        where: { packageVersionId: pkg.currentVersion.id },
        include: { benefitConfigs: { include: { benefitConfig: { select: { category: true } } } } },
      })
    : [];

  // UAT-HF P09.04 (DEF-055 gap 3): "The rules do not appear anywhere on the
  // package DETAIL page (Package Details, Benefit Schedule, Co-Contribution
  // Rules, Version History only), so only a user with edit rights can see the
  // network restrictions."
  //
  // Read from the CURRENT version, because this page shows what is in force —
  // not what is being drafted. A draft's rules belong on the edit screen.
  const networkRules = pkg.currentVersion
    ? await prisma.packageProviderEligibility.findMany({
        where: { packageVersionId: pkg.currentVersion.id },
        include: { provider: { select: { name: true } } },
        orderBy: [{ inclusionType: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const liveNetworkRules = networkRules.filter((r) => r.isActive);
  const retiredNetworkRules = networkRules.filter((r) => !r.isActive);
  const fmtRuleDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-UG", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  const ruleScope = (r: (typeof networkRules)[number]) =>
    r.provider?.name ?? (r.providerTier ? `All ${r.providerTier} tier providers` : "—");

  // Prisma Decimal fields don't survive the RSC boundary — hand the client
  // manager plain numbers.
  const ruleViews = coRules.map((r) => ({
    id: r.id,
    benefitCategory: r.benefitCategory,
    networkTier: r.networkTier,
    type: r.type,
    fixedAmount: r.fixedAmount == null ? null : Number(r.fixedAmount),
    percentage: r.percentage == null ? null : Number(r.percentage),
    perVisitCap: r.perVisitCap == null ? null : Number(r.perVisitCap),
    isActive: r.isActive,
  }));
  const annualCapView = annualCap
    ? {
        individualCap: Number(annualCap.individualCap),
        familyCap: annualCap.familyCap == null ? null : Number(annualCap.familyCap),
      }
    : null;

  const currentBenefits = pkg.currentVersion?.benefits ?? [];
  const totalSubLimit = currentBenefits.reduce((s, b) => s + Number(b.annualSubLimit), 0);

  const categoryLabel = (cat: string) => cat.replace(/_/g, " ");

  const statusColor = (s: string) => {
    switch (s) {
      case "ACTIVE": return "bg-[#28A745]/10 text-[#28A745]";
      case "DRAFT": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "ARCHIVED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/packages" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{pkg.name}</h1>
            <p className="text-brand-text-body text-sm mt-0.5">{pkg.type} · {pkg.description ?? "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${statusColor(pkg.status)}`}>
            {pkg.status}
          </span>
          {canWrite && (
            <Link href={`/packages/${id}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-brand-indigo hover:bg-brand-secondary text-white transition-colors">
              <Pencil size={14} /> Edit
            </Link>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Annual Limit", value: formatMoney(pkg.annualLimit), color: "text-brand-indigo" },
          { label: "Contribution / yr", value: formatMoney(pkg.contributionAmount), color: "text-[#28A745]" },
          { label: "Total Sub-Limit", value: formatMoney(totalSubLimit), color: "text-[#17A2B8]" },
          { label: "Benefit Categories", value: currentBenefits.length.toString(), color: "text-[#6C757D]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs text-brand-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Package details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">Package Details</h2>
          {[
            { label: "Package Type", value: pkg.type },
            { label: "Min Age", value: `${pkg.minAge} yrs` },
            { label: "Max Age", value: `${pkg.maxAge} yrs` },
            { label: "Dependent Max Age", value: `${pkg.dependentMaxAge} yrs` },
            { label: "Current Version", value: pkg.currentVersion ? `v${pkg.currentVersion.versionNumber}` : "—" },
            { label: "Total Versions", value: pkg.versions.length.toString() },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-brand-text-muted">{f.label}</span>
              <span className="font-semibold text-brand-text-heading">{f.value}</span>
            </div>
          ))}

          {(pkg.exclusions as string[]).length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-bold uppercase text-brand-text-muted mb-2">Exclusions</p>
              <div className="flex flex-wrap gap-1.5">
                {(pkg.exclusions as string[]).map((ex, i) => (
                  <span key={i} className="bg-[#DC3545]/10 text-[#DC3545] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">{ex}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Benefits */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <div className="flex justify-between items-center border-b border-[#EEEEEE] pb-2 mb-3">
            <h2 className="font-bold text-brand-text-heading font-heading">Benefit Schedule</h2>
            <Shield size={15} className="text-brand-indigo" />
          </div>
          <div className="space-y-3">
            {currentBenefits.map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm py-1 border-b border-[#EEEEEE] last:border-0">
                <div>
                  <p className="font-semibold text-brand-text-heading">{categoryLabel(b.category)}</p>
                  <div className="flex gap-3 mt-0.5">
                    {/* Funding model (WP-F1/D8) */}
                    <span className={`text-[10px] font-semibold ${b.fundingModel === "FEE_FOR_SERVICE" ? "text-brand-text-muted" : "text-brand-indigo"}`}>
                      {b.fundingModel === "CAPITATION" ? "Capitation" : b.fundingModel === "HYBRID" ? "Hybrid funding" : "Fee for service"}
                    </span>
                    {Number(b.copayPercentage) > 0 && (
                      <span className="text-[10px] text-brand-text-muted">Co-pay: {Number(b.copayPercentage)}%</span>
                    )}
                    {b.perVisitLimit != null && (
                      <span className="text-[10px] text-brand-text-muted flex items-center gap-1">
                        <Activity size={10} /> {formatMoney(b.perVisitLimit)} per visit
                      </span>
                    )}
                    {b.waitingPeriodDays > 0 && (
                      <span className="text-[10px] text-brand-text-muted flex items-center gap-1">
                        <Clock size={10} /> {b.waitingPeriodDays}d wait
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-bold text-brand-indigo text-sm">{formatMoney(b.annualSubLimit)}</span>
              </div>
            ))}
            {currentBenefits.length === 0 && (
              <p className="text-sm text-brand-text-body">No benefits defined for current version.</p>
            )}
          </div>
        </div>
      </div>

      {/* Shared limit pools (version-owned) */}
      {sharedLimits.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
            <Users size={15} className="text-brand-indigo" />
            <h2 className="font-bold text-brand-text-heading font-heading">Shared Limit Pools</h2>
          </div>
          <div className="p-5 grid gap-3">
            {sharedLimits.map((sl) => (
              <div key={sl.id} className="border border-[#EEEEEE] rounded-lg p-4 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-brand-text-heading text-sm">{sl.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted mt-1">
                    <span className="font-semibold text-brand-text-heading">{formatMoney(sl.limitAmount)}</span>
                    <span>•</span>
                    <span>Applies to {sl.appliesTo}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sl.benefitConfigs.map((bc) => (
                      <span key={bc.benefitConfigId} className="bg-[#F1F3F5] text-brand-text-muted text-[10px] font-semibold px-2 py-0.5 rounded uppercase">
                        {bc.benefitConfig.category.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Co-Contribution Rules — the manager is a write surface (setCaps etc.),
          so it is only mounted for package owners. The Membership Officer's
          read-only discovery view omits it (X-002). */}
      {canWrite && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
            <Percent size={15} className="text-brand-indigo" />
            <h2 className="font-bold text-brand-text-heading font-heading">Co-Contribution Rules</h2>
          </div>
          <div className="p-5">
            <CoContributionRulesManager
              packageId={id}
              rules={ruleViews}
              annualCap={annualCapView}
            />
          </div>
        </div>
      )}

      {/* ── Provider network (UAT-HF P09.04 / DEF-055 gap 3) ─────────────────
          Read-only, and present for anyone who can read the package — the whole
          complaint was that only a user with EDIT rights could see which
          hospitals the package pays for. */}
      {pkg.currentVersion && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
            <h2 className="font-bold text-brand-text-heading font-heading">Provider Network Rules</h2>
            <span className="text-xs text-brand-text-muted">Version {pkg.currentVersion.versionNumber}</span>
          </div>

          {liveNetworkRules.length === 0 ? (
            <p className="px-5 py-4 text-sm text-brand-text-muted">
              No network restrictions — every active contracted provider is in network
              for this package.
            </p>
          ) : (
            <>
              <p className="px-5 pt-4 text-xs text-brand-text-muted">
                When rules disagree, the more specific one wins: a rule excluding a
                named provider, then one including a named provider, then any tier rule.
              </p>
              <table className="w-full text-left text-sm mt-2">
                <thead>
                  <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                    <th className="px-5 py-3">Rule</th>
                    <th className="px-5 py-3">Applies to</th>
                    <th className="px-5 py-3">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {liveNetworkRules.map((r) => (
                    <tr key={r.id} className="border-b border-[#EEEEEE] last:border-0">
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          r.inclusionType === "INCLUDE"
                            ? "bg-[#28A745]/10 text-[#28A745]"
                            : "bg-[#DC3545]/10 text-[#DC3545]"
                        }`}>
                          {r.inclusionType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-brand-text-heading font-semibold">{ruleScope(r)}</td>
                      <td className="px-5 py-3 text-brand-text-muted text-xs">
                        {fmtRuleDate(r.effectiveFrom) ?? "From activation"} → {fmtRuleDate(r.effectiveTo) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Retired rules are kept, not deleted, so a claim decided under one
              can still be explained. Shown quietly rather than hidden. */}
          {retiredNetworkRules.length > 0 && (
            <div className="px-5 py-3 border-t border-[#EEEEEE] bg-[#F8F9FA]">
              <p className="text-xs font-bold text-brand-text-muted uppercase mb-1">Withdrawn</p>
              {retiredNetworkRules.map((r) => (
                <p key={r.id} className="text-xs text-brand-text-muted">
                  {r.inclusionType} {ruleScope(r)} — ended {fmtRuleDate(r.effectiveTo) ?? "unknown"}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      {pkg.versions.length > 1 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-brand-text-heading font-heading">Version History</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Effective From</th>
                <th className="px-5 py-3">Benefits</th>
                <th className="px-5 py-3">Current</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {pkg.versions.map(v => (
                <tr key={v.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-mono font-semibold text-brand-text-heading">v{v.versionNumber}</td>
                  <td className="px-5 py-3">{new Date(v.effectiveFrom).toLocaleDateString("en-UG")}</td>
                  <td className="px-5 py-3">{v.benefits.length} categories</td>
                  <td className="px-5 py-3">
                    {v.id === pkg.currentVersionId ? (
                      <span className="flex items-center gap-1 text-[#28A745] font-bold text-xs">
                        <CheckCircle size={12} /> Current
                      </span>
                    ) : (
                      <span className="text-brand-text-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
