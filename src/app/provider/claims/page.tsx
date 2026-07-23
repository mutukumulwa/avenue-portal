import Link from "next/link";
import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { FilePlus2 } from "lucide-react";

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

const FILTERS = ["all", "RECEIVED", "CAPTURED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "PAID", "DECLINED"];

export default async function ProviderClaims({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; submitted?: string; replayed?: string }>;
}) {
  const { provider, tenantId } = await requireProvider();
  const { status, submitted, replayed } = await searchParams;
  const active = status && FILTERS.includes(status) ? status : "all";

  const claims = await prisma.claim.findMany({
    where: {
      tenantId,
      providerId: provider.id,
      ...(active !== "all" ? { status: active as never } : {}),
    },
    select: {
      id: true, claimNumber: true, status: true, billedAmount: true, approvedAmount: true, paidAmount: true,
      dateOfService: true, benefitCategory: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5">
      {submitted && (
        <div className="mb-4 bg-brand-indigo/5 border border-brand-indigo/30 rounded-lg px-4 py-3 text-sm font-semibold text-brand-indigo" role="status">
          {replayed
            ? `Already received — claim ${submitted} (idempotent replay, nothing was duplicated).`
            : `Claim ${submitted} received. It is now in the adjudication pipeline.`}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Claims</h1>
        <Link href="/provider/claims/new" className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">
          <FilePlus2 size={15} /> New claim
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/provider/claims" : `/provider/claims?status=${f}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              active === f ? "bg-brand-indigo text-white border-brand-indigo" : "border-[#EEEEEE] text-brand-text-body hover:bg-white"
            }`}
          >
            {f === "all" ? "All" : f.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {claims.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">No claims{active !== "all" ? ` with status ${active.replace(/_/g, " ")}` : ""}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Claim</th>
                <th className="text-left px-5 py-2 font-bold">Member</th>
                <th className="text-left px-5 py-2 font-bold">Service</th>
                <th className="text-right px-5 py-2 font-bold">Billed</th>
                <th className="text-right px-5 py-2 font-bold">Approved</th>
                <th className="text-right px-5 py-2 font-bold">Paid</th>
                <th className="text-left px-5 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-[#F4F4F4] last:border-0 hover:bg-[#F8F9FA]">
                  <td className="px-5 py-2.5"><Link href={`/provider/claims/${c.id}`} className="font-mono text-xs font-semibold text-brand-indigo">{c.claimNumber}</Link></td>
                  <td className="px-5 py-2.5">{c.member.firstName} {c.member.lastName} <span className="text-brand-text-muted text-xs">({c.member.memberNumber})</span></td>
                  <td className="px-5 py-2.5 text-xs">{c.benefitCategory.replace(/_/g, " ")} · {new Date(c.dateOfService).toLocaleDateString("en-UG")}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(c.billedAmount))}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(c.approvedAmount))}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(c.paidAmount))}</td>
                  <td className="px-5 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[c.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{c.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
