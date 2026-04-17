import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { PackagesService } from "@/server/services/packages.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, Shield, Pencil, Percent } from "lucide-react";

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);

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
          <Link href="/packages" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{pkg.name}</h1>
            <p className="text-avenue-text-body text-sm mt-0.5">{pkg.type} · {pkg.description ?? "No description"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${statusColor(pkg.status)}`}>
            {pkg.status}
          </span>
          <Link href={`/packages/${id}/edit`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-avenue-indigo hover:bg-avenue-secondary text-white transition-colors">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Annual Limit (KES)", value: Number(pkg.annualLimit).toLocaleString(), color: "text-avenue-indigo" },
          { label: "Contribution (KES/yr)", value: Number(pkg.contributionAmount).toLocaleString(), color: "text-[#28A745]" },
          { label: "Total Sub-Limit (KES)", value: totalSubLimit.toLocaleString(), color: "text-[#17A2B8]" },
          { label: "Benefit Categories", value: currentBenefits.length.toString(), color: "text-[#6C757D]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Package details */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Package Details</h2>
          {[
            { label: "Package Type", value: pkg.type },
            { label: "Min Age", value: `${pkg.minAge} yrs` },
            { label: "Max Age", value: `${pkg.maxAge} yrs` },
            { label: "Dependent Max Age", value: `${pkg.dependentMaxAge} yrs` },
            { label: "Current Version", value: pkg.currentVersion ? `v${pkg.currentVersion.versionNumber}` : "—" },
            { label: "Total Versions", value: pkg.versions.length.toString() },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}

          {(pkg.exclusions as string[]).length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-bold uppercase text-avenue-text-muted mb-2">Exclusions</p>
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
            <h2 className="font-bold text-avenue-text-heading font-heading">Benefit Schedule</h2>
            <Shield size={15} className="text-avenue-indigo" />
          </div>
          <div className="space-y-3">
            {currentBenefits.map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm py-1 border-b border-[#EEEEEE] last:border-0">
                <div>
                  <p className="font-semibold text-avenue-text-heading">{categoryLabel(b.category)}</p>
                  <div className="flex gap-3 mt-0.5">
                    {Number(b.copayPercentage) > 0 && (
                      <span className="text-[10px] text-avenue-text-muted">Co-pay: {Number(b.copayPercentage)}%</span>
                    )}
                    {b.waitingPeriodDays > 0 && (
                      <span className="text-[10px] text-avenue-text-muted flex items-center gap-1">
                        <Clock size={10} /> {b.waitingPeriodDays}d wait
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-bold text-avenue-indigo text-sm">KES {Number(b.annualSubLimit).toLocaleString()}</span>
              </div>
            ))}
            {currentBenefits.length === 0 && (
              <p className="text-sm text-avenue-text-body">No benefits defined for current version.</p>
            )}
          </div>
        </div>
      </div>

      {/* Co-Contribution Rules */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Percent size={15} className="text-avenue-indigo" />
            <h2 className="font-bold text-avenue-text-heading font-heading">Co-Contribution Rules</h2>
          </div>
          {annualCap && (
            <span className="text-xs text-avenue-text-muted">
              Annual caps — Individual: KES {Number(annualCap.individualCap).toLocaleString()} · Family: KES {Number(annualCap.familyCap).toLocaleString()}
            </span>
          )}
        </div>
        {coRules.length === 0 ? (
          <p className="px-5 py-4 text-sm text-avenue-text-body">No co-contribution rules configured for this package.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Benefit Category</th>
                <th className="px-5 py-3">Network Tier</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Amount / %</th>
                <th className="px-5 py-3">Per-Visit Cap</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {coRules.map(r => (
                <tr key={r.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">
                    {r.benefitCategory ? r.benefitCategory.replace(/_/g, " ") : <span className="text-avenue-text-muted italic">All categories</span>}
                  </td>
                  <td className="px-5 py-3">{r.networkTier.replace("_", " ")}</td>
                  <td className="px-5 py-3">{r.type.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3 font-mono">
                    {r.type === "PERCENTAGE" || r.type === "HYBRID"
                      ? `${r.percentage ?? 0}%`
                      : r.type === "FIXED_AMOUNT"
                      ? `KES ${Number(r.fixedAmount ?? 0).toLocaleString()}`
                      : "—"}
                    {r.type === "HYBRID" && r.fixedAmount
                      ? ` / KES ${Number(r.fixedAmount).toLocaleString()} floor`
                      : ""}
                  </td>
                  <td className="px-5 py-3 font-mono">
                    {r.perVisitCap ? `KES ${Number(r.perVisitCap).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Version history */}
      {pkg.versions.length > 1 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-avenue-text-heading font-heading">Version History</h2>
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
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {pkg.versions.map(v => (
                <tr key={v.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-mono font-semibold text-avenue-text-heading">v{v.versionNumber}</td>
                  <td className="px-5 py-3">{new Date(v.effectiveFrom).toLocaleDateString("en-KE")}</td>
                  <td className="px-5 py-3">{v.benefits.length} categories</td>
                  <td className="px-5 py-3">
                    {v.id === pkg.currentVersionId ? (
                      <span className="flex items-center gap-1 text-[#28A745] font-bold text-xs">
                        <CheckCircle size={12} /> Current
                      </span>
                    ) : (
                      <span className="text-avenue-text-muted text-xs">—</span>
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
