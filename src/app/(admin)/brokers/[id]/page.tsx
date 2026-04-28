import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

export default async function BrokerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const { id } = await params;
  const broker = await prisma.broker.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      groups: {
        include: { package: { select: { name: true } }, _count: { select: { members: true } } },
        orderBy: { createdAt: "desc" },
      },
      commissions: { orderBy: { period: "desc" }, take: 24 },
      _count: { select: { groups: true } },
    },
  });

  if (!broker) notFound();

  const totalCommissionsEarned = broker.commissions.reduce((s, c) => s + Number(c.commissionAmount), 0);
  const totalCommissionsPaid = broker.commissions
    .filter((c) => c.paymentStatus === "PAID")
    .reduce((s, c) => s + Number(c.commissionAmount), 0);

  const commStatusColor = (status: string) => {
    switch (status) {
      case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "APPROVED": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      default: return "bg-[#FFC107]/10 text-[#FFC107]";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/brokers" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{broker.name}</h1>
              <p className="text-avenue-text-body text-sm mt-0.5">IRA: {broker.licenseNumber ?? "N/A"} · {broker.contactPerson}</p>
            </div>
          </div>
        </div>
        <Link href={`/brokers/${broker.id}/edit`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-avenue-indigo border border-avenue-indigo/30 hover:bg-avenue-indigo/5 px-3 py-1.5 rounded-full transition-colors">
          <Pencil size={13} /> Edit
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: "Groups Managed", value: broker._count.groups, color: "text-avenue-indigo" },
          { label: "Total Earned (KES)", value: totalCommissionsEarned.toLocaleString(), color: "text-[#28A745]" },
          { label: "Total Paid (KES)", value: totalCommissionsPaid.toLocaleString(), color: "text-[#17A2B8]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">Details</h2>
          {[
            { label: "Email", value: broker.email },
            { label: "Phone", value: broker.phone },
            { label: "Address", value: broker.address ?? "—" },
            { label: "1st Year Commission", value: `${Number(broker.firstYearCommissionPct)}%` },
            { label: "Renewal Commission", value: `${Number(broker.renewalCommissionPct)}%` },
            { label: "Flat Fee / Member", value: broker.flatFeePerMember ? `KES ${Number(broker.flatFeePerMember).toLocaleString()}` : "—" },
            { label: "Onboarded", value: new Date(broker.dateOnboarded).toLocaleDateString("en-KE") },
          ].map((f) => (
            <div key={f.label} className="flex justify-between text-sm">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Groups */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-3">Groups</h2>
          <div className="space-y-2">
            {broker.groups.map((g) => (
              <div key={g.id} className="flex justify-between items-center text-sm py-1">
                <div>
                  <Link href={`/groups/${g.id}`} className="font-semibold text-avenue-indigo hover:underline">{g.name}</Link>
                  <p className="text-xs text-avenue-text-muted">{g.package.name}</p>
                </div>
                <span className="text-avenue-text-body">{g._count.members} members</span>
              </div>
            ))}
            {broker.groups.length === 0 && <p className="text-avenue-text-body text-sm">No groups assigned.</p>}
          </div>
        </div>
      </div>

      {/* Commissions */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Commission History</h2>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
              <th className="px-6 py-3">Period</th>
              <th className="px-6 py-3">Contribution (KES)</th>
              <th className="px-6 py-3">Rate</th>
              <th className="px-6 py-3">Commission (KES)</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {broker.commissions.map((c) => (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-6 py-3 font-mono font-semibold text-avenue-text-heading">{c.period}</td>
                <td className="px-6 py-3">{Number(c.contributionReceived).toLocaleString()}</td>
                <td className="px-6 py-3">{Number(c.commissionRate)}%</td>
                <td className="px-6 py-3 font-semibold text-[#28A745]">{Number(c.commissionAmount).toLocaleString()}</td>
                <td className="px-6 py-3">
                  <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${commStatusColor(c.paymentStatus)}`}>
                    {c.paymentStatus}
                  </span>
                </td>
              </tr>
            ))}
            {broker.commissions.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-6 text-center text-avenue-text-body">No commissions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
