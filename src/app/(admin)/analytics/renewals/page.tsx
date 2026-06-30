import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { renewalService } from "@/server/services/renewal.service";
import { ArrowRight, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
  NOT_STARTED:  "bg-[#6C757D]/10 text-[#6C757D]",
  IN_PROGRESS:  "bg-[#17A2B8]/10 text-[#17A2B8]",
  QUOTE_ISSUED: "bg-[#FFC107]/10 text-[#856404]",
  NEGOTIATING:  "bg-brand-indigo/10 text-brand-indigo",
  BOUND:        "bg-[#28A745]/10 text-[#28A745]",
  LAPSED:       "bg-[#DC3545]/10 text-[#DC3545]",
  CANCELLED:    "bg-[#6C757D]/10 text-[#6C757D]",
  WITHDRAWN:    "bg-[#6C757D]/10 text-[#6C757D]",
};

function urgencyColor(days: number): string {
  if (days <= 7)  return "text-[#DC3545] font-bold";
  if (days <= 30) return "text-[#856404] font-semibold";
  if (days <= 60) return "text-[#17A2B8]";
  return "text-brand-text-muted";
}

export default async function RenewalPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ daysAhead?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { daysAhead: daysParam } = await searchParams;
  const daysAhead = daysParam ? Number(daysParam) : 90;

  const scope = await getAnalyticsAccessScope(session);
  const pipeline = await renewalService.getPipeline(scope.tenantId, daysAhead);

  const critical  = pipeline.filter((g) => g.daysToRenewal <= 7);
  const warning   = pipeline.filter((g) => g.daysToRenewal > 7 && g.daysToRenewal <= 30);
  const attention = pipeline.filter((g) => g.daysToRenewal > 30 && g.daysToRenewal <= 60);
  const upcoming  = pipeline.filter((g) => g.daysToRenewal > 60);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Renewal Pipeline</h1>
          <p className="text-brand-text-muted text-sm mt-1">
            {pipeline.length} scheme{pipeline.length !== 1 ? "s" : ""} renewing within {daysAhead} days
          </p>
        </div>
        <div className="flex gap-2">
          {[30, 60, 90].map((d) => (
            <Link key={d} href={`?daysAhead=${d}`}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                daysAhead === d
                  ? "bg-brand-indigo text-white border-brand-indigo"
                  : "border-[#EEEEEE] text-brand-text-muted hover:border-brand-indigo hover:text-brand-indigo"
              }`}>
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Critical (≤7d)", count: critical.length,  color: "text-[#DC3545]", icon: <AlertTriangle size={14} /> },
          { label: "Warning (≤30d)", count: warning.length,   color: "text-[#856404]", icon: <Clock size={14} /> },
          { label: "Attention (≤60d)",count: attention.length, color: "text-[#17A2B8]", icon: <Clock size={14} /> },
          { label: "Upcoming (>60d)", count: upcoming.length, color: "text-brand-text-muted", icon: <CheckCircle2 size={14} /> },
        ].map(({ label, count, color, icon }) => (
          <div key={label} className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4 flex items-center gap-3">
            <span className={color}>{icon}</span>
            <div>
              <p className={`text-2xl font-bold font-heading ${color}`}>{count}</p>
              <p className="text-[11px] text-brand-text-muted mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline table */}
      {pipeline.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-[#28A745] opacity-40" />
          <p className="text-brand-text-muted text-sm">No schemes due for renewal within {daysAhead} days.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Scheme</th>
                <th className="px-5 py-3">Broker</th>
                <th className="px-5 py-3 text-center">Members</th>
                <th className="px-5 py-3">Renewal Date</th>
                <th className="px-5 py-3 text-center">Days Left</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Notice</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {pipeline.map((g) => (
                <tr key={g.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">{g.name}</td>
                  <td className="px-5 py-3 text-brand-text-muted text-xs">{g.broker?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-center font-mono">{g.activeMembers}</td>
                  <td className="px-5 py-3 text-brand-text-muted text-xs">
                    {new Date(g.renewalDate).toLocaleDateString("en-UG")}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={urgencyColor(g.daysToRenewal)}>
                      {g.daysToRenewal}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[g.renewalStatus ?? "NOT_STARTED"] ?? STATUS_STYLE.NOT_STARTED}`}>
                      {(g.renewalStatus ?? "NOT STARTED").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {g.noticeDispatched
                      ? <CheckCircle2 size={14} className="text-[#28A745]" />
                      : <Clock size={14} className="text-brand-text-muted opacity-50" />}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/analytics/renewals/${g.id}`}
                      className="text-brand-indigo hover:text-brand-secondary font-semibold text-xs inline-flex items-center gap-1">
                      Workspace <ArrowRight size={12} />
                    </Link>
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
