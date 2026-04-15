import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function MemberUtilizationPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      member: {
        include: {
          claims: {
            orderBy: { createdAt: "desc" },
            include: { provider: { select: { name: true, type: true } } },
          },
        },
      },
    },
  });

  const member = user?.member;
  if (!member) redirect("/login");

  const claims = member.claims;
  const totalBilled = claims.reduce((s, c) => s + Number(c.billedAmount), 0);
  const totalApproved = claims.reduce((s, c) => s + Number(c.approvedAmount), 0);
  const totalPaid = claims.reduce((s, c) => s + Number(c.paidAmount), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "RECEIVED": case "UNDER_REVIEW": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "PARTIALLY_APPROVED": return "bg-[#FFC107]/10 text-[#856404]";
      case "DECLINED": case "VOID": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Claims History</h1>
        <p className="text-avenue-text-muted mt-1">Your claims and utilization history.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Billed (KES)", value: totalBilled.toLocaleString(), color: "text-avenue-indigo" },
          { label: "Approved (KES)", value: totalApproved.toLocaleString(), color: "text-[#28A745]" },
          { label: "Paid (KES)", value: totalPaid.toLocaleString(), color: "text-[#17A2B8]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="divide-y divide-[#EEEEEE]">
          {claims.map((c) => (
            <div key={c.id} className="px-5 py-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono text-xs text-avenue-text-muted">{c.claimNumber}</p>
                  <p className="font-bold text-avenue-text-heading mt-0.5">{c.provider.name}</p>
                  <p className="text-xs text-avenue-text-muted mt-0.5">
                    {c.serviceType.replace(/_/g, " ")} · {new Date(c.dateOfService).toLocaleDateString("en-KE")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-avenue-text-heading">KES {Number(c.billedAmount).toLocaleString()}</p>
                  {Number(c.approvedAmount) > 0 && (
                    <p className="text-xs text-[#28A745] mt-0.5">Approved: KES {Number(c.approvedAmount).toLocaleString()}</p>
                  )}
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full inline-block mt-1 ${statusColor(c.status)}`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {claims.length === 0 && (
            <div className="px-5 py-12 text-center text-avenue-text-body">No claims on record.</div>
          )}
        </div>
      </div>
    </div>
  );
}
