import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Calculator } from "lucide-react";

export default async function BrokerQuotationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  if (!user?.brokerId) {
    return <div className="p-6 text-center text-avenue-text-body">No broker profile linked.</div>;
  }

  const quotations = await prisma.quotation.findMany({
    where: { brokerId: user.brokerId },
    orderBy: { createdAt: "desc" },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "ACCEPTED": return "bg-[#28A745]/10 text-[#28A745]";
      case "SENT": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "DECLINED": case "EXPIRED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">My Quotations</h1>
          <p className="text-avenue-text-muted mt-1">Quotations you have generated for prospects.</p>
        </div>
        <Link
          href="/quotations/calculator"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
        >
          <Calculator size={18} />
          <span>New Quote</span>
        </Link>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Quote No.</th>
              <th className="px-6 py-4">Prospect</th>
              <th className="px-6 py-4">Members</th>
              <th className="px-6 py-4">Final Premium (KES)</th>
              <th className="px-6 py-4">Valid Until</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {quotations.map((q) => (
              <tr key={q.id} className="hover:bg-[#F8F9FA]">
                <td className="px-6 py-4 font-mono font-semibold text-avenue-text-heading">{q.quoteNumber}</td>
                <td className="px-6 py-4 font-semibold">{q.prospectName ?? "—"}</td>
                <td className="px-6 py-4">{q.memberCount + q.dependentCount}</td>
                <td className="px-6 py-4 font-semibold text-avenue-indigo">{Number(q.finalPremium).toLocaleString()}</td>
                <td className="px-6 py-4">{new Date(q.validUntil).toLocaleDateString("en-KE")}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(q.status)}`}>
                    {q.status}
                  </span>
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-avenue-text-body">No quotations yet. Click &quot;New Quote&quot; to generate one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
