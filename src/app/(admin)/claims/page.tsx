import { requireRole, ROLES } from "@/lib/rbac";
import { ClaimsService } from "@/server/services/claims.service";
import { PlusCircle, ArrowRight, FileSearch, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default async function ClaimsPage() {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;
  const claims = await ClaimsService.getClaims(tenantId);

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "RECEIVED": case "UNDER_REVIEW": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "PARTIALLY_APPROVED": return "bg-[#FFC107]/10 text-[#FFC107]";
      case "DECLINED": case "VOID": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Claims</h1>
          <p className="text-avenue-text-body font-body mt-1">Review and adjudicate medical insurance claims.</p>
        </div>
        <Link 
          href="/claims/new"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
        >
          <PlusCircle size={18} />
          <span>New Claim</span>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", count: claims.length, color: "bg-avenue-indigo" },
          { label: "Pending Review", count: claims.filter(c => ["RECEIVED", "UNDER_REVIEW"].includes(c.status)).length, color: "bg-[#17A2B8]" },
          { label: "Approved", count: claims.filter(c => ["APPROVED", "PARTIALLY_APPROVED"].includes(c.status)).length, color: "bg-[#28A745]" },
          { label: "Declined", count: claims.filter(c => c.status === "DECLINED").length, color: "bg-[#DC3545]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className="text-2xl font-bold text-avenue-text-heading mt-1">{s.count}</p>
            <div className={`h-1 w-12 rounded ${s.color} mt-2`} />
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Claim No.</th>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Service</th>
                <th className="px-6 py-4">Billed (KES)</th>
                <th className="px-6 py-4">Approved (KES)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
              {claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-mono text-avenue-text-heading font-semibold">
                    <div className="flex items-center gap-2">
                      {claim._count.exceptionLogs > 0 && (
                        <span title="Has open exceptions"><ShieldAlert size={14} className="text-[#856404] shrink-0" /></span>
                      )}
                      {claim.claimNumber}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-avenue-text-heading">{claim.member.firstName} {claim.member.lastName}</span>
                      <span className="text-xs">{claim.member.memberNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{claim.provider.name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold uppercase">
                      {claim.serviceType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-avenue-text-heading font-semibold">{Number(claim.billedAmount).toLocaleString()}</td>
                  <td className="px-6 py-4 font-semibold text-[#28A745]">
                    {Number(claim.approvedAmount) > 0 ? Number(claim.approvedAmount).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full inline-flex ${statusColor(claim.status)}`}>
                      {claim.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/claims/${claim.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1">
                      Review <ArrowRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              
              {claims.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-avenue-text-body">
                    <FileSearch size={32} className="mx-auto mb-3 text-[#Dcdcdc]" />
                    No claims found. Click &quot;New Claim&quot; to submit one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
