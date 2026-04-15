import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ShieldAlert, ShieldCheck, ShieldX, ArrowRight } from "lucide-react";
import { resolveExceptionAction } from "@/app/(admin)/claims/[id]/actions";

const CODE_LABELS: Record<string, string> = {
  BENEFIT_EXCEEDED:      "Benefit Limit Exceeded",
  MANUAL_OVERRIDE:       "Manual Rate Override",
  LATE_SUBMISSION:       "Late Submission",
  PROVIDER_RATE_DISPUTE: "Provider Rate Dispute",
  FRAUD_INVESTIGATION:   "Fraud / Integrity Investigation",
  DUPLICATE_CHECK:       "Possible Duplicate",
  OTHER:                 "Other",
};

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const { status } = await searchParams;
  const filterStatus = (status as "PENDING" | "APPROVED" | "REJECTED") ?? undefined;

  const exceptions = await prisma.exceptionLog.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(filterStatus ? { status: filterStatus } : {}),
    },
    include: {
      raisedBy:   { select: { firstName: true, lastName: true } },
      resolvedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const counts = {
    all:      exceptions.length,
    pending:  exceptions.filter(e => e.status === "PENDING").length,
    approved: exceptions.filter(e => e.status === "APPROVED").length,
    rejected: exceptions.filter(e => e.status === "REJECTED").length,
  };

  const tabs = [
    { label: "All",      value: "",         count: counts.all      },
    { label: "Pending",  value: "PENDING",  count: counts.pending  },
    { label: "Approved", value: "APPROVED", count: counts.approved },
    { label: "Rejected", value: "REJECTED", count: counts.rejected },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Exception Register</h1>
        <p className="text-avenue-text-body mt-1 text-sm">
          All manually flagged exceptions across claims and pre-authorisations. Supervisors can approve or reject each one.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total",    value: counts.all,      color: "text-avenue-indigo" },
          { label: "Pending",  value: counts.pending,  color: "text-[#856404]"    },
          { label: "Approved", value: counts.approved, color: "text-[#28A745]"    },
          { label: "Rejected", value: counts.rejected, color: "text-[#DC3545]"    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-avenue-text-muted">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#F8F9FA] rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <Link
            key={t.value}
            href={t.value ? `/settings/exceptions?status=${t.value}` : "/settings/exceptions"}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              (filterStatus ?? "") === t.value
                ? "bg-white text-avenue-indigo shadow-sm"
                : "text-avenue-text-muted hover:text-avenue-text-heading"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs font-bold opacity-70">({t.count})</span>
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-5 py-3 text-left">Type</th>
              <th className="px-5 py-3 text-left">Ref</th>
              <th className="px-5 py-3 text-left">Reason</th>
              <th className="px-5 py-3 text-left">Raised By</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {exceptions.map(ex => (
              <tr key={ex.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3">
                  <span className="text-xs font-bold text-avenue-text-heading">
                    {CODE_LABELS[ex.exceptionCode] ?? ex.exceptionCode}
                  </span>
                  <p className="text-[10px] text-avenue-text-muted mt-0.5">{ex.entityType}</p>
                </td>
                <td className="px-5 py-3">
                  {ex.claimId ? (
                    <Link href={`/claims/${ex.claimId}`} className="font-mono text-xs font-bold text-avenue-indigo hover:text-avenue-secondary flex items-center gap-1">
                      {ex.entityRef ?? ex.claimId.slice(0, 8)} <ArrowRight size={11} />
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-avenue-text-muted">{ex.entityRef ?? ex.entityId.slice(0, 8)}</span>
                  )}
                </td>
                <td className="px-5 py-3 max-w-xs">
                  <p className="text-avenue-text-heading">{ex.reason}</p>
                  {ex.notes && <p className="text-xs text-avenue-text-muted mt-0.5 truncate">{ex.notes}</p>}
                </td>
                <td className="px-5 py-3 text-avenue-text-body">
                  {ex.raisedBy.firstName} {ex.raisedBy.lastName}
                </td>
                <td className="px-5 py-3 text-avenue-text-muted text-xs">
                  {new Date(ex.createdAt).toLocaleDateString("en-KE")}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${
                    ex.status === "PENDING"  ? "bg-[#FFC107]/15 text-[#856404]" :
                    ex.status === "APPROVED" ? "bg-[#28A745]/10 text-[#28A745]" :
                    "bg-[#DC3545]/10 text-[#DC3545]"
                  }`}>
                    {ex.status === "PENDING"  && <ShieldAlert size={10} />}
                    {ex.status === "APPROVED" && <ShieldCheck  size={10} />}
                    {ex.status === "REJECTED" && <ShieldX      size={10} />}
                    {ex.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {ex.status === "PENDING" && ex.claimId && (
                    <div className="flex gap-2">
                      <form action={resolveExceptionAction}>
                        <input type="hidden" name="exceptionId"    value={ex.id} />
                        <input type="hidden" name="claimId"        value={ex.claimId} />
                        <input type="hidden" name="status"         value="APPROVED" />
                        <input type="hidden" name="resolutionNote" value="Approved via exception register." />
                        <button type="submit" className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#28A745]/10 text-[#28A745] hover:bg-[#28A745]/20 transition-colors">
                          Approve
                        </button>
                      </form>
                      <form action={resolveExceptionAction}>
                        <input type="hidden" name="exceptionId"    value={ex.id} />
                        <input type="hidden" name="claimId"        value={ex.claimId} />
                        <input type="hidden" name="status"         value="REJECTED" />
                        <input type="hidden" name="resolutionNote" value="Rejected via exception register." />
                        <button type="submit" className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#DC3545]/10 text-[#DC3545] hover:bg-[#DC3545]/20 transition-colors">
                          Reject
                        </button>
                      </form>
                    </div>
                  )}
                  {ex.status !== "PENDING" && ex.resolvedBy && (
                    <p className="text-[10px] text-avenue-text-muted">
                      {ex.resolvedBy.firstName} {ex.resolvedBy.lastName}
                      <br />{ex.resolvedAt ? new Date(ex.resolvedAt).toLocaleDateString("en-KE") : ""}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {exceptions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-avenue-text-muted">
                  No exceptions {filterStatus ? `with status "${filterStatus}"` : "recorded"} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
