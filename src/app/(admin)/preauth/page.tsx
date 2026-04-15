import { requireRole, ROLES } from "@/lib/rbac";
import { ClaimsService } from "@/server/services/claims.service";
import { PlusCircle, Stethoscope, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function PreAuthPage() {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId = session.user.tenantId;
  const preauths = await ClaimsService.getPreAuthorizations(tenantId);

  const statusColor = (status: string) => {
    switch (status) {
      case "APPROVED": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUBMITTED": case "UNDER_REVIEW": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "CONVERTED_TO_CLAIM": return "bg-avenue-indigo/10 text-avenue-indigo";
      case "DECLINED": case "EXPIRED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Pre-Authorizations</h1>
          <p className="text-avenue-text-body font-body mt-1">Manage pre-authorization requests for planned procedures.</p>
        </div>
        <Link 
          href="/preauth/new"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm"
        >
          <PlusCircle size={18} />
          <span>New Pre-Auth</span>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", count: preauths.length, color: "bg-avenue-indigo" },
          { label: "Pending Review", count: preauths.filter(p => ["SUBMITTED", "UNDER_REVIEW"].includes(p.status)).length, color: "bg-[#17A2B8]" },
          { label: "Approved", count: preauths.filter(p => p.status === "APPROVED").length, color: "bg-[#28A745]" },
          { label: "Converted", count: preauths.filter(p => p.status === "CONVERTED_TO_CLAIM").length, color: "bg-avenue-indigo" },
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
                <th className="px-6 py-4">PA Number</th>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Service</th>
                <th className="px-6 py-4">Estimated Cost (KES)</th>
                <th className="px-6 py-4">Benefit</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
              {preauths.map((pa) => (
                <tr key={pa.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-mono text-avenue-text-heading font-semibold">{pa.preauthNumber}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-avenue-text-heading">{pa.member.firstName} {pa.member.lastName}</span>
                      <span className="text-xs">{pa.member.memberNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{pa.provider.name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold uppercase">
                      {pa.serviceType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-avenue-text-heading font-semibold">{Number(pa.estimatedCost).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="bg-avenue-indigo/10 text-avenue-indigo px-2 py-1 rounded text-xs font-bold uppercase">
                      {pa.benefitCategory.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full inline-flex ${statusColor(pa.status)}`}>
                      {pa.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/preauth/${pa.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1">
                      Review <ArrowRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              
              {preauths.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-avenue-text-body">
                    <Stethoscope size={32} className="mx-auto mb-3 text-[#Dcdcdc]" />
                    No pre-authorizations found. Click &quot;New Pre-Auth&quot; to submit one.
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
