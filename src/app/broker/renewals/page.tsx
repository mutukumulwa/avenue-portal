import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function BrokerRenewalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });

  if (!user?.brokerId) {
    return <div className="p-6 text-center text-avenue-text-body">No broker profile linked.</div>;
  }

  const groups = await prisma.group.findMany({
    where: { brokerId: user.brokerId, status: "ACTIVE" },
    include: {
      package: { select: { name: true, contributionAmount: true } },
      _count: { select: { members: true } },
    },
    orderBy: { renewalDate: "asc" },
  });

  const now = new Date();
  const getUrgency = (renewalDate: Date) => {
    const days = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
    if (days < 0) return { label: "Overdue", color: "bg-[#DC3545]/10 text-[#DC3545]", days };
    if (days <= 14) return { label: "Critical", color: "bg-[#DC3545]/10 text-[#DC3545]", days };
    if (days <= 30) return { label: "Urgent", color: "bg-[#FFC107]/10 text-[#856404]", days };
    if (days <= 60) return { label: "Upcoming", color: "bg-[#17A2B8]/10 text-[#17A2B8]", days };
    return { label: "Scheduled", color: "bg-[#28A745]/10 text-[#28A745]", days };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Renewals</h1>
        <p className="text-avenue-text-muted mt-1">Track upcoming policy renewals for your groups.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Due in 30 Days", count: groups.filter((g) => getUrgency(g.renewalDate).days <= 30 && getUrgency(g.renewalDate).days >= 0).length, color: "text-[#FFC107]" },
          { label: "Due in 60 Days", count: groups.filter((g) => getUrgency(g.renewalDate).days <= 60 && getUrgency(g.renewalDate).days >= 0).length, color: "text-[#17A2B8]" },
          { label: "Overdue", count: groups.filter((g) => getUrgency(g.renewalDate).days < 0).length, color: "text-[#DC3545]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Group</th>
              <th className="px-6 py-4">Package</th>
              <th className="px-6 py-4">Members</th>
              <th className="px-6 py-4">Annual Premium (KES)</th>
              <th className="px-6 py-4">Renewal Date</th>
              <th className="px-6 py-4">Urgency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {groups.map((g) => {
              const urgency = getUrgency(g.renewalDate);
              const annualPremium = g._count.members * Number(g.package.contributionAmount);
              return (
                <tr key={g.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-6 py-4 font-bold text-avenue-text-heading">{g.name}</td>
                  <td className="px-6 py-4">{g.package.name}</td>
                  <td className="px-6 py-4 font-semibold">{g._count.members}</td>
                  <td className="px-6 py-4 font-semibold">{annualPremium.toLocaleString()}</td>
                  <td className="px-6 py-4">{new Date(g.renewalDate).toLocaleDateString("en-KE")}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${urgency.color}`}>
                      {urgency.label} ({urgency.days < 0 ? `${Math.abs(urgency.days)}d overdue` : `${urgency.days}d`})
                    </span>
                  </td>
                </tr>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-avenue-text-body">No groups found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
