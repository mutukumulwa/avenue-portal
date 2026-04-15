import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Building2, Users, DollarSign, RefreshCw } from "lucide-react";

export default async function BrokerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Broker is identified by the user's brokerId
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      broker: {
        include: {
          groups: {
            include: { _count: { select: { members: true } } },
            orderBy: { renewalDate: "asc" },
          },
          commissions: {
            where: { paymentStatus: "PENDING" },
          },
        },
      },
    },
  });

  const broker = user?.broker;

  if (!broker) {
    return (
      <div className="p-6 text-center text-avenue-text-body">
        <p>No broker profile linked to your account. Please contact the administrator.</p>
      </div>
    );
  }

  const totalMembers = broker.groups.reduce((s, g) => s + g._count.members, 0);
  const pendingCommissions = broker.commissions.reduce((s, c) => s + Number(c.commissionAmount), 0);
  const renewalSoon = broker.groups.filter((g) => {
    const days = Math.ceil((g.renewalDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return days >= 0 && days <= 60;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-heading text-avenue-text-heading">Welcome, {broker.name}</h1>
        <p className="text-avenue-text-muted mt-1">Your broker dashboard overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active Groups", value: broker.groups.length, icon: Building2, color: "text-avenue-indigo" },
          { label: "Total Members", value: totalMembers, icon: Users, color: "text-[#28A745]" },
          { label: "Pending Commissions (KES)", value: pendingCommissions.toLocaleString(), icon: DollarSign, color: "text-[#FFC107]" },
          { label: "Renewals Due (60 days)", value: renewalSoon.length, icon: RefreshCw, color: "text-[#DC3545]" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Groups */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-avenue-text-heading font-heading">My Groups</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {broker.groups.slice(0, 5).map((g) => (
              <div key={g.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-avenue-text-heading">{g.name}</p>
                  <p className="text-xs text-avenue-text-muted">{g._count.members} members · Renews {new Date(g.renewalDate).toLocaleDateString("en-KE")}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                  g.status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"
                }`}>{g.status}</span>
              </div>
            ))}
            {broker.groups.length === 0 && (
              <div className="px-5 py-8 text-center text-avenue-text-body text-sm">No groups assigned.</div>
            )}
          </div>
        </div>

        {/* Renewals coming up */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-avenue-text-heading font-heading">Upcoming Renewals</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {renewalSoon.slice(0, 5).map((g) => {
              const daysLeft = Math.ceil((g.renewalDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
              return (
                <div key={g.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold text-avenue-text-heading">{g.name}</p>
                    <p className="text-xs text-avenue-text-muted">{new Date(g.renewalDate).toLocaleDateString("en-KE")}</p>
                  </div>
                  <span className={`font-bold text-sm ${daysLeft <= 14 ? "text-[#DC3545]" : "text-[#FFC107]"}`}>
                    {daysLeft}d
                  </span>
                </div>
              );
            })}
            {renewalSoon.length === 0 && (
              <div className="px-5 py-8 text-center text-avenue-text-body text-sm">No renewals due in 60 days.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
