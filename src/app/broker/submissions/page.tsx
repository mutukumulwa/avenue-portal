import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function BrokerSubmissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  if (!user?.brokerId) {
    return <div className="p-6 text-center text-avenue-text-body">No broker profile linked.</div>;
  }

  const endorsements = await prisma.endorsement.findMany({
    where: { group: { brokerId: user.brokerId } },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": case "APPLIED": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUBMITTED": case "UNDER_REVIEW": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "REJECTED": case "CANCELLED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Endorsement Submissions</h1>
          <p className="text-avenue-text-muted mt-1">Endorsements submitted for your groups.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Endorsement No.</th>
              <th className="px-6 py-4">Group</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Effective Date</th>
              <th className="px-6 py-4">Pro-Rata (KES)</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {endorsements.map((e) => (
              <tr key={e.id} className="hover:bg-[#F8F9FA]">
                <td className="px-6 py-4 font-mono font-semibold text-avenue-text-heading">{e.endorsementNumber}</td>
                <td className="px-6 py-4">{e.group.name}</td>
                <td className="px-6 py-4">
                  <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold">
                    {e.type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-6 py-4">{new Date(e.effectiveDate).toLocaleDateString("en-KE")}</td>
                <td className="px-6 py-4 font-semibold">
                  {e.proratedAmount ? Number(e.proratedAmount).toLocaleString() : "—"}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(e.status)}`}>
                    {e.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link href={`/broker/submissions/${e.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1">
                    View <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {endorsements.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-avenue-text-body">No submissions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
