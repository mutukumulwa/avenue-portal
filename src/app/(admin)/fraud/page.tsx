import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { FraudSeverity } from "@prisma/client";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";

export default async function FraudDashboardPage(props: {
  searchParams: Promise<{ resolved?: string; severity?: string }>;
}) {
  await requireRole(ROLES.OPS);

  const { resolved, severity } = await props.searchParams;
  const showResolved = resolved === "true";

  const alerts = await prisma.claimFraudAlert.findMany({
    where: {
      resolved: showResolved,
      ...(severity ? { severity: severity as FraudSeverity } : {}),
    },
    include: {
      claim: {
        include: {
          member: { select: { firstName: true, lastName: true, memberNumber: true } },
          provider: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const [openCount, highCount, mediumCount] = await Promise.all([
    prisma.claimFraudAlert.count({ where: { resolved: false } }),
    prisma.claimFraudAlert.count({ where: { resolved: false, severity: "HIGH" } }),
    prisma.claimFraudAlert.count({ where: { resolved: false, severity: "MEDIUM" } }),
  ]);

  const severityBadge = (s: string) => {
    switch (s) {
      case "CRITICAL": return "bg-[#6F1C1C] text-white";
      case "HIGH":     return "bg-[#DC3545]/15 text-[#DC3545]";
      case "MEDIUM":   return "bg-[#FFC107]/15 text-[#856404]";
      default:         return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Fraud Alert Desk</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">Heuristic flags raised during claim submission. Review and dismiss or escalate.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={showResolved ? "/fraud" : "/fraud?resolved=true"}
            className="border border-[#EEEEEE] text-avenue-text-body px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#F8F9FA] transition-colors"
          >
            {showResolved ? "View Open" : "View Resolved"}
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open Alerts", value: openCount, icon: ShieldAlert, color: "text-[#DC3545]" },
          { label: "High Severity", value: highCount, icon: AlertTriangle, color: "text-[#DC3545]" },
          { label: "Medium Severity", value: mediumCount, icon: AlertTriangle, color: "text-[#856404]" },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase text-avenue-text-muted">{card.label}</p>
                <Icon size={15} className={card.color} />
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Severity filter */}
      <div className="flex gap-2 flex-wrap">
        {["", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(s => (
          <Link
            key={s}
            href={`/fraud${showResolved ? "?resolved=true" : ""}${s ? (showResolved ? "&severity=" : "?severity=") + s : ""}`}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
              severity === s || (!severity && !s)
                ? "bg-avenue-indigo text-white border-avenue-indigo"
                : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo"
            }`}
          >
            {s || "All"}
          </Link>
        ))}
      </div>

      {/* Alert table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-avenue-text-muted gap-2">
            <ShieldCheck size={36} className="text-[#28A745]" />
            <p className="font-semibold">No {showResolved ? "resolved" : "open"} alerts{severity ? ` at ${severity} severity` : ""}.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEEEEE] bg-[#F8F9FA] text-avenue-text-muted text-xs font-bold uppercase">
                <th className="px-5 py-3 text-left">Claim</th>
                <th className="px-5 py-3 text-left">Member</th>
                <th className="px-5 py-3 text-left">Rule Triggered</th>
                <th className="px-5 py-3 text-left">Severity</th>
                <th className="px-5 py-3 text-left">Score</th>
                <th className="px-5 py-3 text-left">Flagged</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {alerts.map(alert => (
                <tr key={alert.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/claims/${alert.claimId}`} className="font-mono text-xs text-avenue-indigo hover:underline font-bold">
                      {alert.claim.claimNumber}
                    </Link>
                    <p className="text-[10px] text-avenue-text-muted mt-0.5">{alert.claim.provider.name}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{alert.claim.member.firstName} {alert.claim.member.lastName}</p>
                    <p className="text-[10px] font-mono text-avenue-text-muted">{alert.claim.member.memberNumber}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{alert.rule}</p>
                    {alert.notes && <p className="text-[10px] text-avenue-text-muted mt-0.5 max-w-xs">{alert.notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${severityBadge(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[#EEEEEE] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${alert.score}%`,
                            backgroundColor: alert.score >= 80 ? "#DC3545" : alert.score >= 60 ? "#FFC107" : "#28A745",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono">{alert.score}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-avenue-text-muted">
                    {new Date(alert.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/fraud/${alert.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-avenue-indigo hover:text-avenue-secondary transition-colors"
                    >
                      {alert.resolved ? (
                        <><ShieldCheck size={13} className="text-[#28A745]" /> View</>
                      ) : (
                        <>Investigate <ArrowRight size={13} /></>
                      )}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
