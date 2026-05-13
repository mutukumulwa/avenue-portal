import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowRight, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function AssessorQueuePage() {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const now = new Date();

  // Own queue items
  const myItems = await prisma.assessorWorkQueueItem.findMany({
    where: { tenantId, assignedToId: userId, completedAt: null },
    orderBy: [{ slaBreached: "desc" }, { slaDeadlineAt: "asc" }],
    include: {
      quotation: {
        select: {
          id: true, quoteNumber: true, clientType: true,
          legalName: true, prospectName: true,
          headcount: true, memberCount: true, dependentCount: true,
          requestedCoverStart: true, status: true,
          broker: { select: { name: true } },
        },
      },
    },
  });

  // All unallocated (PENDING_ASSESSMENT with no queue item) — visible to senior/admin
  const unallocated = await prisma.quotation.findMany({
    where: { tenantId, status: "PENDING_ASSESSMENT", workQueueItem: null },
    select: {
      id: true, quoteNumber: true, clientType: true,
      legalName: true, prospectName: true,
      headcount: true, memberCount: true, dependentCount: true,
      requestedCoverStart: true,
      broker: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  // Pending senior approval
  const pendingSenior = await prisma.quotation.findMany({
    where: { tenantId, status: "ASSESSED_PENDING_SENIOR_APPROVAL" },
    select: {
      id: true, quoteNumber: true, clientType: true,
      legalName: true, prospectName: true,
      broker: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  function slaLabel(deadline: Date, breached: boolean) {
    if (breached) return { text: "SLA breached", cls: "text-[#DC3545]" };
    const hoursLeft = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60)));
    if (hoursLeft < 2) return { text: `${hoursLeft}h left`, cls: "text-[#DC3545]" };
    if (hoursLeft < 8) return { text: `${hoursLeft}h left`, cls: "text-[#856404]" };
    return { text: `${hoursLeft}h left`, cls: "text-[#28A745]" };
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Assessor Queue</h1>
        <p className="text-avenue-text-muted text-sm mt-1">Submissions assigned for underwriting assessment</p>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "My Queue",         count: myItems.length,     color: "text-avenue-indigo" },
          { label: "Pending Senior",   count: pendingSenior.length, color: "text-[#C4500A]"  },
          { label: "Unallocated",      count: unallocated.length,  color: "text-[#856404]"   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* My queue */}
      <section className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-semibold text-avenue-text-heading text-sm">My Assigned Submissions</h2>
        </div>
        {myItems.length === 0 ? (
          <p className="px-6 py-10 text-center text-avenue-text-muted text-sm">
            <Clock size={28} className="mx-auto mb-2 opacity-30" />
            No submissions assigned to you
          </p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Quote</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Broker</th>
                <th className="px-5 py-3">Lives</th>
                <th className="px-5 py-3">Cover Start</th>
                <th className="px-5 py-3">SLA</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {myItems.map(item => {
                const q = item.quotation;
                const sla = slaLabel(item.slaDeadlineAt, item.slaBreached);
                return (
                  <tr key={item.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{q.quoteNumber}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-avenue-text-heading">{q.legalName ?? q.prospectName ?? "—"}</p>
                      <p className="text-xs text-avenue-text-muted">{q.clientType} · {q.headcount ?? (q.memberCount + q.dependentCount)} lives</p>
                    </td>
                    <td className="px-5 py-3 text-avenue-text-body">{q.broker?.name ?? "Direct"}</td>
                    <td className="px-5 py-3 text-avenue-text-body">{q.memberCount + q.dependentCount}</td>
                    <td className="px-5 py-3 text-avenue-text-body">
                      {q.requestedCoverStart ? new Date(q.requestedCoverStart).toLocaleDateString("en-KE") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold text-xs flex items-center gap-1 ${sla.cls}`}>
                        {item.slaBreached && <AlertTriangle size={12} />}
                        {sla.text}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/quotations/${q.id}/assess`}
                        className="text-avenue-indigo hover:text-avenue-secondary font-semibold text-xs inline-flex items-center gap-1">
                        Assess <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Pending senior approval */}
      {pendingSenior.length > 0 && (
        <section className="bg-white border border-[#FD7E14]/40 rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FD7E14]/30 bg-[#FD7E14]/5">
            <h2 className="font-semibold text-[#C4500A] text-sm flex items-center gap-2">
              <AlertTriangle size={15} /> Awaiting Senior Approval ({pendingSenior.length})
            </h2>
          </div>
          <table className="w-full text-sm text-left">
            <tbody className="divide-y divide-[#EEEEEE]">
              {pendingSenior.map(q => (
                <tr key={q.id} className="hover:bg-[#FFF8F5] transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{q.quoteNumber}</td>
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">{q.legalName ?? q.prospectName ?? "—"}</td>
                  <td className="px-5 py-3 text-avenue-text-body">{q.broker?.name ?? "Direct"}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/quotations/${q.id}/assess`}
                      className="text-[#C4500A] hover:text-[#FD7E14] font-semibold text-xs inline-flex items-center gap-1">
                      Review <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Unallocated */}
      {unallocated.length > 0 && (
        <section className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-semibold text-avenue-text-heading text-sm">Unallocated — Pending Assignment</h2>
            <p className="text-xs text-avenue-text-muted mt-0.5">Allocation job runs every 10 minutes</p>
          </div>
          <table className="w-full text-sm text-left">
            <tbody className="divide-y divide-[#EEEEEE]">
              {unallocated.map(q => (
                <tr key={q.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-avenue-text-heading">{q.quoteNumber}</td>
                  <td className="px-5 py-3 font-semibold text-avenue-text-heading">{q.legalName ?? q.prospectName ?? "—"}</td>
                  <td className="px-5 py-3 text-avenue-text-muted">{q.broker?.name ?? "Direct"}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/quotations/${q.id}/assess`}
                      className="text-avenue-indigo hover:text-avenue-secondary font-semibold text-xs inline-flex items-center gap-1">
                      Open <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
