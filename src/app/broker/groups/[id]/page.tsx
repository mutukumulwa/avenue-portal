import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function BrokerGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { brokerId: true } });
  if (!user?.brokerId) redirect("/broker/groups");

  const { id } = await params;
  const group = await prisma.group.findFirst({
    where: { id, tenantId: session.user.tenantId, brokerId: user.brokerId },
    include: {
      package: { select: { name: true, annualLimit: true } },
      _count: { select: { members: true, endorsements: true } },
      members: { where: { status: "ACTIVE" }, take: 20, select: { id: true, firstName: true, lastName: true, memberNumber: true, relationship: true } },
    },
  });
  if (!group) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/broker/groups" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">{group.name}</h1>
          <p className="text-sm text-avenue-text-muted mt-1">{group.package.name} · {group.status}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm"><p className="text-xs font-bold uppercase text-avenue-text-muted">Members</p><p className="text-2xl font-bold text-avenue-indigo">{group._count.members}</p></div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm"><p className="text-xs font-bold uppercase text-avenue-text-muted">Endorsements</p><p className="text-2xl font-bold text-[#17A2B8]">{group._count.endorsements}</p></div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm"><p className="text-xs font-bold uppercase text-avenue-text-muted">Annual Limit</p><p className="text-2xl font-bold text-[#28A745]">KES {Number(group.package.annualLimit).toLocaleString()}</p></div>
      </div>
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE]"><h2 className="font-bold text-avenue-text-heading">Active Members</h2></div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[#EEEEEE]">
            {group.members.map(member => (
              <tr key={member.id}>
                <td className="px-5 py-3 font-semibold">{member.firstName} {member.lastName}</td>
                <td className="px-5 py-3 font-mono text-xs">{member.memberNumber}</td>
                <td className="px-5 py-3">{member.relationship}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
