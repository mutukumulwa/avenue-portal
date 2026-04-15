import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PlusCircle } from "lucide-react";

export default async function MemberPreauthPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      member: {
        include: {
          preauths: {
            orderBy: { createdAt: "desc" },
            include: { provider: { select: { name: true } } },
          },
        },
      },
    },
  });

  const member = user?.member;
  if (!member) redirect("/login");

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": case "CONVERTED_TO_CLAIM": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUBMITTED": case "UNDER_REVIEW": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "DECLINED": case "CANCELLED": return "bg-[#DC3545]/10 text-[#DC3545]";
      case "EXPIRED": return "bg-[#6C757D]/10 text-[#6C757D]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Pre-Authorizations</h1>
          <p className="text-avenue-text-muted mt-1">Request and track pre-authorizations for planned procedures.</p>
        </div>
        <button className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full font-semibold text-sm transition-colors flex items-center gap-2 shadow-sm">
          <PlusCircle size={16} /> Request Pre-Auth
        </button>
      </div>

      <div className="space-y-3">
        {member.preauths.map((pa) => (
          <div key={pa.id} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-mono text-xs text-avenue-text-muted">{pa.preauthNumber}</p>
                <p className="font-bold text-avenue-text-heading mt-0.5">{pa.provider.name}</p>
                <p className="text-sm text-avenue-text-muted mt-0.5">
                  {pa.serviceType.replace(/_/g, " ")} ·{" "}
                  {pa.expectedDateOfService ? new Date(pa.expectedDateOfService).toLocaleDateString("en-KE") : "Date TBD"}
                </p>
                <p className="text-xs text-avenue-text-muted mt-1">
                  Estimated: KES {Number(pa.estimatedCost).toLocaleString()}
                  {pa.approvedAmount && (
                    <> · Approved: <span className="font-bold text-[#28A745]">KES {Number(pa.approvedAmount).toLocaleString()}</span></>
                  )}
                </p>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(pa.status)}`}>
                  {pa.status.replace(/_/g, " ")}
                </span>
                {pa.validUntil && pa.status === "APPROVED" && (
                  <p className="text-xs text-avenue-text-muted mt-1.5">
                    Valid until: {new Date(pa.validUntil).toLocaleDateString("en-KE")}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {member.preauths.length === 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-8 text-center text-avenue-text-body shadow-sm">
            No pre-authorizations on record. Click &quot;Request Pre-Auth&quot; to submit a new request.
          </div>
        )}
      </div>
    </div>
  );
}
