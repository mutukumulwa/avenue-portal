import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FileText, Eye } from "lucide-react";
import Link from "next/link";
import { Prisma, EndorsementStatus, EndorsementType } from "@prisma/client";
import { EndorsementFilters } from "./EndorsementFilters";

export default async function HREndorsementsPage(
  props: {
    searchParams: Promise<{ status?: string; type?: string }>
  }
) {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;

  if (!groupId) {
    return <div className="p-8">No group assigned.</div>;
  }

  const searchParams = await props.searchParams;
  const statusFilter = searchParams.status || "";
  const typeFilter = searchParams.type || "";

  const whereClause: Prisma.EndorsementWhereInput = { groupId };
  if (statusFilter) whereClause.status = statusFilter as EndorsementStatus;
  if (typeFilter) whereClause.type = typeFilter as EndorsementType;

  const endorsements = await prisma.endorsement.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
       member: { select: { firstName: true, lastName: true } }
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED": return "bg-[#28A745]/10 text-[#28A745]";
      case "PROCESSING": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "SUBMITTED": return "bg-[#FFC107]/10 text-[#856404]";
      case "REJECTED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Endorsement Requests</h1>
          <p className="text-avenue-text-body font-body mt-1">Track the status of your reported additions, terminations, and group changes.</p>
        </div>
        <Link href="/hr/roster/new" className="px-5 py-2 bg-avenue-indigo text-white rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors">
          + New Endorsement
        </Link>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-4 border-b border-[#EEEEEE] bg-[#F8F9FA]">
          <EndorsementFilters statusFilter={statusFilter} typeFilter={typeFilter} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-white border-b border-[#EEEEEE] text-avenue-text-muted font-heading text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Endorsement No.</th>
                <th className="px-6 py-4 font-bold">Type</th>
                <th className="px-6 py-4 font-bold">Subject</th>
                <th className="px-6 py-4 font-bold">Effective Date</th>
                <th className="px-6 py-4 font-bold">Date Requested</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {endorsements.map((en) => (
                <tr key={en.id} className="hover:bg-[#F8F9FA] transition-colors group">
                  <td className="px-6 py-4 font-bold text-avenue-text-heading font-mono text-xs">
                     <div className="flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-avenue-indigo opacity-50" />
                        {en.endorsementNumber}
                     </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-avenue-text-heading">
                     {en.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">
                     {en.member ? `${en.member.firstName} ${en.member.lastName}` : (
                        (en.changeDetails as Record<string, string>)?.firstName 
                           ? `${(en.changeDetails as Record<string, string>).firstName} ${(en.changeDetails as Record<string, string>).lastName}`
                           : "Group Change"
                     )}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">
                     {new Date(en.effectiveDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-muted">
                     {new Date(en.requestedDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                     <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadge(en.status)}`}>
                        {en.status}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-avenue-indigo hover:text-avenue-secondary inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-4 h-4 mr-1" />
                      <span className="text-xs font-bold">View</span>
                    </button>
                  </td>
                </tr>
              ))}
              {endorsements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-avenue-text-body">
                     No endorsement requests found matching your criteria.
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
