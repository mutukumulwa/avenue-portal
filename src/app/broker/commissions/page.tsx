import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function BrokerCommissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  if (!user?.brokerId) {
    return <div className="p-6 text-center text-avenue-text-body">No broker profile linked.</div>;
  }

  const commissions = await prisma.commission.findMany({
    where: { brokerId: user.brokerId },
    orderBy: { period: "desc" },
  });

  const totalEarned = commissions.reduce((s, c) => s + Number(c.commissionAmount), 0);
  const totalPaid = commissions.filter((c) => c.paymentStatus === "PAID").reduce((s, c) => s + Number(c.commissionAmount), 0);
  const totalPending = totalEarned - totalPaid;

  const statusColor = (status: string) => {
    switch (status) {
      case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "APPROVED": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      default: return "bg-[#FFC107]/10 text-[#856404]";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Commissions</h1>
        <p className="text-avenue-text-muted mt-1">Your commission earnings and payment status.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Earned (KES)", value: totalEarned.toLocaleString(), color: "text-avenue-indigo" },
          { label: "Total Paid (KES)", value: totalPaid.toLocaleString(), color: "text-[#28A745]" },
          { label: "Pending (KES)", value: totalPending.toLocaleString(), color: "text-[#FFC107]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Period</th>
              <th className="px-6 py-4">Contribution (KES)</th>
              <th className="px-6 py-4">Rate</th>
              <th className="px-6 py-4">Commission (KES)</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Paid Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-6 py-4 font-mono font-semibold text-avenue-text-heading">{c.period}</td>
                <td className="px-6 py-4">{Number(c.contributionReceived).toLocaleString()}</td>
                <td className="px-6 py-4">{Number(c.commissionRate)}%</td>
                <td className="px-6 py-4 font-semibold text-[#28A745]">{Number(c.commissionAmount).toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(c.paymentStatus)}`}>
                    {c.paymentStatus}
                  </span>
                </td>
                <td className="px-6 py-4">{c.paidAt ? new Date(c.paidAt).toLocaleDateString("en-KE") : "—"}</td>
              </tr>
            ))}
            {commissions.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-avenue-text-body">No commissions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
