import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

function statusColor(status: string) {
  switch (status) {
    case "PAID":
    case "COMPLETED":
      return "bg-[#28A745]/10 text-[#28A745]";
    case "PAYABLE":
    case "APPROVED":
      return "bg-[#17A2B8]/10 text-[#17A2B8]";
    case "EARNED":
    case "ACCRUED":
    case "DRAFT":
    case "PENDING_APPROVAL":
    case "PENDING_RECONCILIATION":
      return "bg-[#FFC107]/15 text-[#856404]";
    case "REJECTED":
    case "CLAWED_BACK":
    case "PARTIAL_FAILURE":
      return "bg-[#DC3545]/10 text-[#DC3545]";
    default:
      return "bg-[#6C757D]/10 text-[#6C757D]";
  }
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full whitespace-nowrap ${statusColor(status)}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default async function BrokerCommissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  if (!user?.brokerId) {
    return <div className="p-6 text-center text-brand-text-body">No broker profile linked.</div>;
  }

  const ledger = await prisma.commissionLedgerEntry.findMany({
    where: { brokerId: user.brokerId },
    include: {
      schedule: { select: { scheduleName: true } },
      payoutBatch: { select: { batchReference: true, status: true, batchDate: true } },
    },
    orderBy: { earnedPeriodStart: "desc" },
    take: 100,
  });

  const groupIds = Array.from(new Set(ledger.map(entry => entry.groupId)));
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds }, brokerId: user.brokerId },
    select: { id: true, name: true },
  });
  const groupNameById = new Map(groups.map(group => [group.id, group.name]));

  const payoutBatches = await prisma.commissionPayoutBatch.findMany({
    where: { entries: { some: { brokerId: user.brokerId } } },
    include: { entries: { where: { brokerId: user.brokerId }, select: { id: true, netPayable: true } } },
    orderBy: { batchDate: "desc" },
    take: 25,
  });

  const totalEarned = ledger.reduce((s, entry) => s + Number(entry.grossCommission), 0);
  const totalPaid = ledger.filter(entry => entry.state === "PAID").reduce((s, entry) => s + Number(entry.netPayable), 0);
  const totalPayable = ledger
    .filter(entry => ["EARNED", "ACCRUED", "PAYABLE"].includes(entry.state))
    .reduce((s, entry) => s + Number(entry.netPayable), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-brand-text-heading">Commissions</h1>
        <p className="text-brand-text-muted mt-1">Your commission ledger, payout batches, and payment status.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: "Gross Earned", value: formatCurrency(totalEarned), color: "text-brand-indigo" },
          { label: "Paid Net", value: formatCurrency(totalPaid), color: "text-[#28A745]" },
          { label: "Payable Net", value: formatCurrency(totalPayable), color: "text-[#FFC107]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-brand-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading">Ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
                <th className="px-6 py-3">Period</th>
                <th className="px-6 py-3">Scheme</th>
                <th className="px-6 py-3">Schedule</th>
                <th className="px-6 py-3 text-right">Gross</th>
                <th className="px-6 py-3 text-right">WHT</th>
                <th className="px-6 py-3 text-right">VAT</th>
                <th className="px-6 py-3 text-right">Net</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {ledger.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-6 py-4 font-mono font-semibold text-brand-text-heading">{formatDate(entry.earnedPeriodStart)}</td>
                  <td className="px-6 py-4">{groupNameById.get(entry.groupId) ?? "Scheme"}</td>
                  <td className="px-6 py-4">{entry.schedule?.scheduleName ?? "Pending schedule"}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(entry.grossCommission)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(entry.withholdingTax)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(entry.vatAmount)}</td>
                  <td className="px-6 py-4 text-right font-semibold text-[#28A745]">{formatCurrency(entry.netPayable)}</td>
                  <td className="px-6 py-4"><Badge status={entry.state} /></td>
                  <td className="px-6 py-4 font-mono text-xs">{entry.payoutBatch?.batchReference ?? "-"}</td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-brand-text-body">No commission ledger entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading">Payout Batches</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
                <th className="px-6 py-3">Batch</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3 text-right">Net Payable</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
              {payoutBatches.map((batch) => (
                <tr key={batch.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-6 py-4 font-mono font-semibold text-brand-text-heading">{batch.batchReference}</td>
                  <td className="px-6 py-4">{formatDate(batch.batchDate)}</td>
                  <td className="px-6 py-4 text-right font-semibold">{formatCurrency(batch.entries.reduce((sum, entry) => sum + Number(entry.netPayable), 0))}</td>
                  <td className="px-6 py-4"><Badge status={batch.status} /></td>
                </tr>
              ))}
              {payoutBatches.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-brand-text-body">No payout batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
