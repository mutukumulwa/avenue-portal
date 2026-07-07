import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { Banknote } from "lucide-react";

function money(n: number) {
  // OBS-2: settlement is a base-currency (UGX) ledger; align with the admin
  // settlement + adjudicate panels instead of a hardcoded "KES".
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const TONE: Record<string, string> = {
  PENDING: "bg-[#FFC107]/10 text-[#856404]",
  MAKER_SUBMITTED: "bg-[#FFC107]/10 text-[#856404]",
  CHECKER_APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  SETTLED: "bg-brand-indigo/10 text-brand-indigo",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function ProviderSettlements() {
  const { provider, tenantId } = await requireProvider();

  const [batches, paidAgg, vouchers] = await Promise.all([
    prisma.providerSettlementBatch.findMany({
      where: { tenantId, providerId: provider.id },
      select: {
        id: true, status: true, totalAmount: true, cycleMonth: true, cycleYear: true, settledAt: true, createdAt: true,
        _count: { select: { claims: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.providerSettlementBatch.aggregate({
      where: { tenantId, providerId: provider.id, status: "SETTLED" },
      _sum: { totalAmount: true },
    }),
    prisma.paymentVoucher.findMany({
      where: { tenantId, providerId: provider.id },
      select: { settlementBatchId: true, voucherNumber: true },
    }),
  ]);
  const voucherByBatch = new Map(vouchers.filter((v) => v.settlementBatchId).map((v) => [v.settlementBatchId as string, v.voucherNumber]));

  const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><Banknote size={22} /> Settlements</h1>
        <div className="bg-white border border-[#EEEEEE] rounded-lg px-4 py-2 text-right">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Total settled</p>
          <p className="text-lg font-bold text-brand-indigo">{money(Number(paidAgg._sum.totalAmount ?? 0))}</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {batches.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">No settlement batches yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Cycle</th>
                <th className="text-right px-5 py-2 font-bold">Claims</th>
                <th className="text-right px-5 py-2 font-bold">Amount</th>
                <th className="text-left px-5 py-2 font-bold">Voucher</th>
                <th className="text-left px-5 py-2 font-bold">Status</th>
                <th className="text-left px-5 py-2 font-bold">Settled</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-[#F4F4F4] last:border-0">
                  <td className="px-5 py-2.5 font-semibold">{MONTHS[b.cycleMonth] ?? b.cycleMonth} {b.cycleYear}</td>
                  <td className="px-5 py-2.5 text-right">{b._count.claims}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(b.totalAmount))}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{voucherByBatch.get(b.id) ?? "—"}</td>
                  <td className="px-5 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE[b.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{b.status.replace(/_/g, " ")}</span></td>
                  <td className="px-5 py-2.5 text-xs text-brand-text-muted">{b.settledAt ? new Date(b.settledAt).toLocaleDateString("en-UG") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
