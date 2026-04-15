import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Shield, QrCode, Phone } from "lucide-react";

export default async function MemberDashboardPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      member: {
        include: {
          group: { select: { name: true, renewalDate: true } },
          package: {
            include: {
              currentVersion: {
                include: { benefits: true },
              },
            },
          },
          benefitUsages: {
            include: { benefitConfig: { select: { category: true, annualSubLimit: true } } },
          },
          claims: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { claimNumber: true, status: true, billedAmount: true, createdAt: true },
          },
          preauths: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { preauthNumber: true, status: true, estimatedCost: true, createdAt: true },
          },
        },
      },
    },
  });

  const member = user?.member;
  if (!member) {
    return (
      <div className="text-center py-12 text-avenue-text-body">
        No member profile linked to your account. Please contact support.
      </div>
    );
  }

  const benefits = member.package.currentVersion?.benefits ?? [];
  const totalLimit = benefits.reduce((s, b) => s + Number(b.annualSubLimit), 0);
  const totalUsed = member.benefitUsages.reduce((s, u) => s + Number(u.amountUsed), 0);
  const totalRemaining = totalLimit - totalUsed;

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": case "PAID": case "CONVERTED_TO_CLAIM": return "text-[#28A745]";
      case "RECEIVED": case "UNDER_REVIEW": case "SUBMITTED": return "text-[#17A2B8]";
      case "DECLINED": return "text-[#DC3545]";
      default: return "text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      {/* Digital Member Card */}
      <div className="bg-gradient-to-br from-avenue-indigo to-[#435BA1] text-white rounded-2xl p-6 shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-bold uppercase opacity-70 tracking-wide">Avenue Healthcare</p>
            <h1 className="text-2xl font-bold font-heading mt-1">{member.firstName} {member.lastName}</h1>
            <p className="opacity-80 text-sm mt-0.5">{member.group.name}</p>
            <p className="text-xs opacity-60 mt-2 font-mono">{member.memberNumber}</p>
          </div>
          <div className="bg-white/20 p-2 rounded-lg">
            <QrCode size={48} className="opacity-80" />
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-white/20 flex justify-between text-sm">
          <div>
            <p className="opacity-60 text-xs uppercase">Package</p>
            <p className="font-semibold">{member.package.name}</p>
          </div>
          <div>
            <p className="opacity-60 text-xs uppercase">Renewal</p>
            <p className="font-semibold">{new Date(member.group.renewalDate).toLocaleDateString("en-KE")}</p>
          </div>
          <div>
            <p className="opacity-60 text-xs uppercase">Status</p>
            <p className="font-semibold">{member.status.replace(/_/g, " ")}</p>
          </div>
        </div>
      </div>

      {/* Benefit Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Annual Limit (KES)", value: totalLimit.toLocaleString(), color: "text-avenue-indigo" },
          { label: "Used (KES)", value: totalUsed.toLocaleString(), color: "text-[#FFC107]" },
          { label: "Remaining (KES)", value: totalRemaining.toLocaleString(), color: "text-[#28A745]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Claims */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
            <h2 className="font-bold text-avenue-text-heading font-heading">Recent Claims</h2>
            <a href="/member/utilization" className="text-avenue-indigo text-xs font-semibold hover:underline">View all</a>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {member.claims.map((c) => (
              <div key={c.claimNumber} className="px-5 py-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-mono text-xs text-avenue-text-muted">{c.claimNumber}</p>
                  <p className="font-semibold text-avenue-text-heading">KES {Number(c.billedAmount).toLocaleString()}</p>
                </div>
                <span className={`text-xs font-bold ${statusColor(c.status)}`}>{c.status.replace(/_/g, " ")}</span>
              </div>
            ))}
            {member.claims.length === 0 && (
              <div className="px-5 py-6 text-center text-avenue-text-body text-sm">No claims on record.</div>
            )}
          </div>
        </div>

        {/* Pre-Auths */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
            <h2 className="font-bold text-avenue-text-heading font-heading">Pre-Authorizations</h2>
            <a href="/member/preauth" className="text-avenue-indigo text-xs font-semibold hover:underline">View all</a>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {member.preauths.map((p) => (
              <div key={p.preauthNumber} className="px-5 py-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-mono text-xs text-avenue-text-muted">{p.preauthNumber}</p>
                  <p className="font-semibold text-avenue-text-heading">KES {Number(p.estimatedCost).toLocaleString()}</p>
                </div>
                <span className={`text-xs font-bold ${statusColor(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
              </div>
            ))}
            {member.preauths.length === 0 && (
              <div className="px-5 py-6 text-center text-avenue-text-body text-sm">No pre-authorizations.</div>
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp CTA */}
      <a
        href="https://wa.me/254700000000"
        className="fixed bottom-6 right-6 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center gap-2"
      >
        <Phone size={22} />
        <span className="font-semibold text-sm">WhatsApp Us</span>
      </a>
    </div>
  );
}
