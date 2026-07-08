import Link from "next/link";
import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { FilePlus2, UserCheck, FileText, Banknote } from "lucide-react";

function money(n: number) {
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const STATUS_TONE: Record<string, string> = {
  RECEIVED: "bg-[#FFC107]/10 text-[#856404]",
  CAPTURED: "bg-[#FFC107]/10 text-[#856404]",
  UNDER_REVIEW: "bg-[#17A2B8]/10 text-[#17A2B8]",
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  PARTIALLY_APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  PAID: "bg-brand-indigo/10 text-brand-indigo",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function ProviderDashboard() {
  const { provider, tenantId } = await requireProvider();

  const [counts, recent, sums] = await Promise.all([
    prisma.claim.groupBy({
      by: ["status"],
      where: { tenantId, providerId: provider.id },
      _count: { _all: true },
    }),
    prisma.claim.findMany({
      where: { tenantId, providerId: provider.id },
      select: {
        id: true, claimNumber: true, status: true, billedAmount: true, approvedAmount: true,
        dateOfService: true, createdAt: true,
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.claim.aggregate({
      where: { tenantId, providerId: provider.id },
      _sum: { billedAmount: true, approvedAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pending = countByStatus("RECEIVED") + countByStatus("CAPTURED") + countByStatus("UNDER_REVIEW");

  const kpis = [
    { label: "Total claims", value: (sums._count._all ?? 0).toLocaleString() },
    { label: "Awaiting adjudication", value: pending.toLocaleString() },
    { label: "Approved / partial", value: (countByStatus("APPROVED") + countByStatus("PARTIALLY_APPROVED")).toLocaleString() },
    { label: "Paid to date", value: money(Number(sums._sum.paidAmount ?? 0)) },
  ];

  const notOperational = !["ACTIVE"].includes(provider.contractStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{provider.name}</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">
            {provider.type} · {provider.tier} · {provider.county ?? "—"} ·{" "}
            <span className={notOperational ? "text-[#DC3545] font-semibold" : "text-[#28A745] font-semibold"}>
              {provider.contractStatus}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/provider/eligibility" className="flex items-center gap-1.5 rounded-full border border-[#EEEEEE] px-4 py-2 text-sm font-semibold text-brand-text-heading hover:bg-white">
            <UserCheck size={15} /> Check eligibility
          </Link>
          <Link href="/provider/claims/new" className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
            <FilePlus2 size={15} /> New claim
          </Link>
        </div>
      </div>

      {notOperational && (
        <div className="rounded-lg bg-[#FFF8E1] border border-[#FFC107]/50 px-4 py-3 text-sm font-semibold text-[#856404]">
          This facility&apos;s contract is {provider.contractStatus}. New claims can only be filed against an ACTIVE contract — contact the TPA.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4">
            <p className="text-[11px] font-bold uppercase text-brand-text-muted">{k.label}</p>
            <p className="text-xl font-bold text-brand-text-heading mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2"><FileText size={16} /> Recent claims</h2>
          <Link href="/provider/claims" className="text-sm font-semibold text-brand-indigo">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center text-brand-text-muted text-sm">
            No claims yet. <Link href="/provider/claims/new" className="text-brand-indigo font-semibold">File your first claim</Link>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Claim</th>
                <th className="text-left px-5 py-2 font-bold">Member</th>
                <th className="text-right px-5 py-2 font-bold">Billed</th>
                <th className="text-right px-5 py-2 font-bold">Approved</th>
                <th className="text-left px-5 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id} className="border-b border-[#F4F4F4] last:border-0">
                  <td className="px-5 py-2.5">
                    <Link href={`/provider/claims/${c.id}`} className="font-mono text-xs font-semibold text-brand-indigo">{c.claimNumber}</Link>
                  </td>
                  <td className="px-5 py-2.5">{c.member.firstName} {c.member.lastName} <span className="text-brand-text-muted text-xs">({c.member.memberNumber})</span></td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(c.billedAmount))}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(c.approvedAmount))}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[c.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Link href="/provider/settlements" className="bg-white border border-[#EEEEEE] rounded-lg p-4 flex items-center gap-3 hover:border-brand-indigo/40">
          <Banknote size={20} className="text-brand-indigo" />
          <div>
            <p className="font-semibold text-brand-text-heading">Settlements</p>
            <p className="text-xs text-brand-text-muted">Batches paid to this facility + statements</p>
          </div>
        </Link>
        <Link href="/provider/api-keys" className="bg-white border border-[#EEEEEE] rounded-lg p-4 flex items-center gap-3 hover:border-brand-indigo/40">
          <FileText size={20} className="text-brand-indigo" />
          <div>
            <p className="font-semibold text-brand-text-heading">HMS integration</p>
            <p className="text-xs text-brand-text-muted">API keys for your hospital management system</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
