import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function BrokerGroupsPage() {
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
    where: { brokerId: user.brokerId },
    include: {
      package: { select: { name: true } },
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">My Groups</h1>
        <p className="text-avenue-text-muted mt-1">Corporate groups under your brokerage.</p>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-4">Group Name</th>
              <th className="px-6 py-4">Package</th>
              <th className="px-6 py-4">Members</th>
              <th className="px-6 py-4">Renewal Date</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-[#F8F9FA]">
                <td className="px-6 py-4 font-bold text-avenue-text-heading">{g.name}</td>
                <td className="px-6 py-4">{g.package.name}</td>
                <td className="px-6 py-4 font-semibold">{g._count.members}</td>
                <td className="px-6 py-4">{new Date(g.renewalDate).toLocaleDateString("en-KE")}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${
                    g.status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"
                  }`}>{g.status}</span>
                </td>
                <td className="px-6 py-4">
                  <Link href={`/broker/groups/${g.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1">
                    View <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-avenue-text-body">No groups found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
