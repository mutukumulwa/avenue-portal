import { requireRole, ROLES } from "@/lib/rbac";
import { overrideService } from "@/server/services/override.service";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function OverridePatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  // Compliance-gated page — ADMIN_ONLY in lieu of COMPLIANCE_OFFICER role
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { days: daysParam } = await searchParams;
  const lookbackDays = daysParam ? Number(daysParam) : 30;

  const tenantId = session.user.tenantId;
  const now = new Date();
  const fromDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const [patterns, summary] = await Promise.all([
    overrideService.getPatterns(tenantId, { fromDate }),
    overrideService.generateDailySummary(tenantId),
  ]);

  const maxTotal = patterns[0]?.total ?? 1;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/overrides" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Override Patterns</h1>
          <p className="text-avenue-text-muted text-sm mt-1">
            Compliance view — override request frequency and approver behaviour
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`?days=${d}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                lookbackDays === d
                  ? "bg-avenue-indigo text-white border-avenue-indigo"
                  : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo hover:text-avenue-indigo"
              }`}>
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pending",         value: summary.pending,        color: "text-[#856404]" },
          { label: "Approved (24h)",  value: summary.approvedToday,  color: "text-[#28A745]" },
          { label: "Rejected (24h)",  value: summary.rejectedToday,  color: "text-[#DC3545]" },
          { label: "SLA Breached",    value: summary.slaBreached,    color: summary.slaBreached > 0 ? "text-[#DC3545] font-bold" : "text-avenue-text-muted" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4">
            <p className="text-xs text-avenue-text-muted">{label}</p>
            <p className={`text-2xl font-bold font-heading mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Abuse warning */}
      {patterns.some((p) => p.total > 10) && (
        <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-4 flex items-start gap-3">
          <AlertTriangle size={15} className="text-[#856404] mt-0.5 shrink-0" />
          <p className="text-sm text-[#856404]">
            One or more users have submitted <strong>more than 10 override requests</strong> in the past {lookbackDays} days.
            Review the patterns below and consider whether the volume is appropriate.
          </p>
        </div>
      )}

      {/* Per-maker frequency chart */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-avenue-text-heading text-sm border-b border-[#EEEEEE] pb-2">
          Override Requests by Maker — Last {lookbackDays} Days
        </h2>

        {patterns.length === 0 ? (
          <p className="text-sm text-avenue-text-muted text-center py-6">No override requests in this period.</p>
        ) : (
          <div className="space-y-3">
            {patterns.map((p) => {
              const barWidth = Math.round((p.total / maxTotal) * 100);
              const approvalRate = p.total > 0 ? Math.round((p.approved / p.total) * 100) : 0;
              return (
                <div key={p.makerId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-avenue-text-heading">{p.makerName}</span>
                    <div className="flex items-center gap-3 text-xs text-avenue-text-muted">
                      <span className="text-[#28A745]">{p.approved} approved</span>
                      <span className="text-[#DC3545]">{p.rejected} rejected</span>
                      <span className="font-bold text-avenue-text-heading">{p.total} total</span>
                    </div>
                  </div>
                  {/* Bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#EEEEEE] rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${p.total > 10 ? "bg-[#DC3545]" : "bg-avenue-indigo"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-avenue-text-muted w-16 text-right">{approvalRate}% approved</span>
                  </div>
                  {/* Type breakdown */}
                  <div className="flex flex-wrap gap-1 pl-0">
                    {Object.entries(p.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                      <span key={type} className="text-[10px] bg-[#F8F9FA] border border-[#EEEEEE] px-2 py-0.5 rounded-full text-avenue-text-muted">
                        {type.replace(/_/g, " ")} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Override type distribution */}
      {summary.byType.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-avenue-text-heading text-sm border-b border-[#EEEEEE] pb-2">
            Override Type Distribution — Last 24h
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {summary.byType.map(({ type, count }) => (
              <div key={type} className="border border-[#EEEEEE] rounded-[6px] px-3 py-2">
                <p className="text-[11px] text-avenue-text-muted">{type.replace(/_/g, " ")}</p>
                <p className="font-bold text-avenue-text-heading mt-0.5">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
