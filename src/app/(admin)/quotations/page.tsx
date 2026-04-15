import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowRight, Calculator, FileText } from "lucide-react";
import Link from "next/link";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { Suspense } from "react";

const STATUS_OPTIONS = [
  { value: "DRAFT",    label: "Draft"    },
  { value: "SENT",     label: "Sent"     },
  { value: "REVISED",  label: "Revised"  },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED",  label: "Expired"  },
];

const STATUS_STYLE: Record<string, string> = {
  DRAFT:    "bg-[#6C757D]/10 text-[#6C757D]",
  SENT:     "bg-[#17A2B8]/10 text-[#17A2B8]",
  REVISED:  "bg-[#292A83]/10 text-[#292A83]",
  ACCEPTED: "bg-[#28A745]/10 text-[#28A745]",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED:  "bg-[#FFC107]/10 text-[#856404]",
};

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const { q, status } = await searchParams;
  const tenantId = session.user.tenantId;

  const where = {
    tenantId,
    ...(status ? { status: status as never } : {}),
    ...(q ? {
      OR: [
        { quoteNumber:    { contains: q, mode: "insensitive" as const } },
        { prospectName:   { contains: q, mode: "insensitive" as const } },
        { prospectEmail:  { contains: q, mode: "insensitive" as const } },
        { prospectIndustry: { contains: q, mode: "insensitive" as const } },
        { group: { name:  { contains: q, mode: "insensitive" as const } } },
        { broker: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {}),
  };

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      select: {
        id: true, quoteNumber: true, status: true,
        prospectName: true, prospectIndustry: true,
        memberCount: true, dependentCount: true,
        finalPremium: true, validUntil: true,
        group:  { select: { name: true } },
        broker: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.quotation.count({ where: { tenantId } }),
  ]);

  const accepted = quotations.filter(q => q.status === "ACCEPTED").length;
  const pending  = quotations.filter(q => ["DRAFT","SENT"].includes(q.status)).length;
  const lost     = quotations.filter(q => ["DECLINED","EXPIRED"].includes(q.status)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Quotations</h1>
          <p className="text-avenue-text-muted mt-1 text-sm">Track and manage all quotations and the premium calculator.</p>
        </div>
        <Link
          href="/quotations/calculator"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
        >
          <Calculator size={18} />
          New Quotation
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total",            count: total,    color: "text-avenue-indigo" },
          { label: "Accepted",         count: accepted, color: "text-[#28A745]"    },
          { label: "Pending",          count: pending,  color: "text-[#856404]"    },
          { label: "Declined/Expired", count: lost,     color: "text-[#DC3545]"    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      <Suspense>
        <SearchFilterBar
          placeholder="Search by quote no., prospect, broker…"
          resultCount={quotations.length}
          totalCount={total}
          filters={[
            { key: "status", label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </Suspense>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Quote No.</th>
                <th className="px-6 py-4">Prospect / Group</th>
                <th className="px-6 py-4">Broker</th>
                <th className="px-6 py-4">Lives</th>
                <th className="px-6 py-4">Final Contribution (KES)</th>
                <th className="px-6 py-4">Valid Until</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
              {quotations.map(q => (
                <tr key={q.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-avenue-text-heading">{q.quoteNumber}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-avenue-text-heading">{q.group?.name ?? q.prospectName ?? "—"}</p>
                    {q.prospectIndustry && <p className="text-xs text-avenue-text-muted">{q.prospectIndustry}</p>}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">{q.broker?.name ?? "Direct"}</td>
                  <td className="px-6 py-4 font-semibold text-avenue-text-heading">{q.memberCount + q.dependentCount}</td>
                  <td className="px-6 py-4 font-semibold text-avenue-indigo">{Number(q.finalPremium).toLocaleString("en-KE")}</td>
                  <td className="px-6 py-4 text-avenue-text-body">{new Date(q.validUntil).toLocaleDateString("en-KE")}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLE[q.status] ?? STATUS_STYLE.DRAFT}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/quotations/${q.id}`}
                      className="text-avenue-indigo hover:text-avenue-secondary font-semibold text-xs inline-flex items-center gap-1 transition-colors">
                      View <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-avenue-text-muted">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    {q || status
                      ? "No quotations match your search."
                      : "No quotations yet. Click \"New Quotation\" to generate one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
