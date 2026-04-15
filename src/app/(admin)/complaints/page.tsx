import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { MessageSquareWarning, CheckCircle2, ArrowRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  OPEN:          "bg-[#DC3545]/10 text-[#DC3545]",
  INVESTIGATING: "bg-[#FFC107]/10 text-[#856404]",
  RESOLVED:      "bg-[#28A745]/10 text-[#28A745]",
  DISMISSED:     "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function ComplaintsPage(props: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  await requireRole(ROLES.OPS);

  const { status, type } = await props.searchParams;

  const complaints = await prisma.complaint.findMany({
    where: {
      ...(status ? { status: status as "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED" } : {}),
      ...(type   ? { type }   : {}),
    },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await prisma.complaint.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map(c => [c.status, c._count._all]));

  const types = ["SERVICE", "FACILITY", "BILLING", "CLINICAL", "GENERAL"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Complaints Triage</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">Member and provider grievances — separated from HR service desk queries.</p>
        </div>
      </div>

      {/* Status KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {(["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const).map(s => (
          <Link
            key={s}
            href={`/complaints?status=${s}`}
            className={`bg-white border rounded-lg p-4 shadow-sm hover:border-avenue-indigo/30 transition-all ${
              status === s ? "border-avenue-indigo ring-1 ring-avenue-indigo/20" : "border-[#EEEEEE]"
            }`}
          >
            <p className="text-xs font-bold uppercase text-avenue-text-muted">{s.replace("_", " ")}</p>
            <p className={`text-2xl font-bold mt-1 ${STATUS_STYLES[s].split(" ")[1]}`}>
              {byStatus[s] ?? 0}
            </p>
          </Link>
        ))}
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={status ? `/complaints?status=${status}` : "/complaints"}
          className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
            !type ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo"
          }`}
        >
          All Types
        </Link>
        {types.map(t => (
          <Link
            key={t}
            href={`/complaints?${status ? `status=${status}&` : ""}type=${t}`}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
              type === t ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {/* Complaints table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        {complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-avenue-text-muted">
            <CheckCircle2 size={36} className="text-[#28A745]" />
            <p className="font-semibold">No complaints matching your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEEEEE] bg-[#F8F9FA] text-avenue-text-muted text-xs font-bold uppercase">
                <th className="px-5 py-3 text-left">Subject</th>
                <th className="px-5 py-3 text-left">Member</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Submitted</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {complaints.map(c => (
                <tr key={c.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-avenue-text-heading">{c.subject}</p>
                    <p className="text-[10px] text-avenue-text-muted mt-0.5 max-w-xs line-clamp-1">{c.description}</p>
                  </td>
                  <td className="px-5 py-3">
                    {c.member ? (
                      <>
                        <p className="font-semibold text-avenue-text-heading">{c.member.firstName} {c.member.lastName}</p>
                        <p className="text-[10px] font-mono text-avenue-text-muted">{c.member.memberNumber}</p>
                      </>
                    ) : (
                      <span className="text-avenue-text-muted text-xs italic">Anonymous</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                      {c.type}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-avenue-text-muted">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/complaints/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-avenue-indigo hover:text-avenue-secondary transition-colors"
                    >
                      View <ArrowRight size={13} />
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
