import { requireRole, ROLES } from "@/lib/rbac";
import { overrideService } from "@/server/services/override.service";
import { Clock, CheckCircle2, XCircle, AlertTriangle, BarChart2 } from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
  PENDING:  "bg-[#FFC107]/10 text-[#856404]",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED:  "bg-[#6C757D]/10 text-[#6C757D]",
};

const TYPE_LABEL: Record<string, string> = {
  BACK_DATED_AMENDMENT:            "Back-dated Amendment",
  BACK_DATED_COVER_START:          "Back-dated Cover Start",
  RATE_DEVIATION_EXCEED:           "Rate Deviation",
  PRE_AUTH_OVER_BENEFIT_CAP:       "Pre-Auth Over Cap",
  CLAIM_EXCLUDED_DIAGNOSIS:        "Excluded Diagnosis Claim",
  FORCE_APPROVE_FRAUD_CLAIM:       "Force-Approve Fraud Claim",
  WAIVE_CO_CONTRIBUTION:           "Waive Co-Contribution",
  EXTEND_GRACE_PERIOD:             "Extend Grace Period",
  MID_TERM_RATE_CHANGE:            "Mid-term Rate Change",
  FRAUD_RULE_THRESHOLD_ADJUSTMENT: "Fraud Rule Threshold",
  RESTORE_TERMINATED_MEMBERSHIP:   "Restore Terminated Membership",
  PRIVILEGE_ESCALATION:            "Privilege Escalation",
  CUSTOM:                          "Custom",
};

export default async function OverrideQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { status } = await searchParams;
  const tenantId = session.user.tenantId;

  const { items, total } = await overrideService.list(tenantId, {
    status: status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | undefined,
    pageSize: 100,
  });

  const pending  = items.filter((r) => r.status === "PENDING");
  const resolved = items.filter((r) => r.status !== "PENDING");

  const now = new Date();
  function slaMinutesLeft(deadline: Date) {
    return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 60000));
  }
  function slaColor(deadline: Date) {
    const mins = slaMinutesLeft(deadline);
    if (mins === 0) return "text-[#DC3545] font-bold";
    if (mins < 30)  return "text-[#856404] font-semibold";
    return "text-[#28A745]";
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Override Queue</h1>
          <p className="text-brand-text-muted text-sm mt-1">
            All rule overrides requiring approval — {pending.length} pending
          </p>
        </div>
        <Link href="/overrides/patterns"
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1.5 rounded-full hover:bg-brand-indigo/5 transition-colors">
          <BarChart2 size={13} /> Compliance Patterns
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Pending",  value: "PENDING",  count: items.filter((r) => r.status === "PENDING").length },
          { label: "Approved", value: "APPROVED", count: items.filter((r) => r.status === "APPROVED").length },
          { label: "Rejected", value: "REJECTED", count: items.filter((r) => r.status === "REJECTED").length },
          { label: "All",      value: "",         count: total },
        ].map(({ label, value, count }) => (
          <Link key={value} href={value ? `?status=${value}` : "/overrides"}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              (status ?? "") === value
                ? "bg-brand-indigo text-white border-brand-indigo"
                : "border-[#EEEEEE] text-brand-text-muted hover:border-brand-indigo hover:text-brand-indigo"
            }`}>
            {label} ({count})
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-[#28A745] opacity-40" />
          <p className="text-brand-text-muted text-sm">No override records found.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Maker</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">SLA</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {items.map((r) => {
                const isSlaBreached = r.status === "PENDING" && r.slaDeadlineAt && new Date() > r.slaDeadlineAt;
                return (
                  <tr key={r.id} className={`hover:bg-[#F8F9FA] transition-colors ${isSlaBreached ? "bg-[#DC3545]/5" : ""}`}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-brand-text-heading text-xs">
                        {TYPE_LABEL[r.overrideType] ?? r.overrideType}
                      </p>
                      {isSlaBreached && (
                        <span className="text-[10px] text-[#DC3545] font-bold flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={9} /> SLA BREACHED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-brand-text-muted font-mono">
                      {r.entityType}<br />
                      <span className="text-[10px] opacity-60">{r.entityId.slice(0, 12)}…</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-brand-text-body">
                      {(r.maker as { firstName: string; lastName: string }).firstName}{" "}
                      {(r.maker as { firstName: string; lastName: string }).lastName}
                    </td>
                    <td className="px-5 py-3 text-xs text-brand-text-muted">
                      {r.reasonCode.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? ""}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {r.status === "PENDING" && r.slaDeadlineAt ? (
                        <span className={`text-xs ${slaColor(r.slaDeadlineAt)}`}>
                          {slaMinutesLeft(r.slaDeadlineAt) === 0
                            ? "Expired"
                            : `${slaMinutesLeft(r.slaDeadlineAt)}m left`}
                        </span>
                      ) : (
                        <span className="text-xs text-brand-text-muted">
                          {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString("en-KE") : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/overrides/${r.id}`}
                        className="text-brand-indigo hover:text-brand-secondary font-semibold text-xs">
                        {r.status === "PENDING" ? "Review →" : "View →"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
