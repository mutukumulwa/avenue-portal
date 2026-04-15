import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Search, Plus, Download, Eye, FileSpreadsheet } from "lucide-react";
import type { MemberRelationship, Prisma } from "@prisma/client";
import { RosterFilters } from "./RosterFilters";

export default async function RosterPage(
  props: {
    searchParams: Promise<{ q?: string; status?: string; relationship?: string }>
  }
) {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;
  
  if (!groupId) {
    return <div className="p-8">No group assigned.</div>;
  }

  const searchParams = await props.searchParams;
  const q = searchParams.q || "";
  const statusFilter = searchParams.status || "";
  const relFilter = searchParams.relationship || "";

  const whereClause: Prisma.MemberWhereInput = { groupId };
  if (q) {
    whereClause.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { memberNumber: { contains: q, mode: "insensitive" } },
      { idNumber: { contains: q, mode: "insensitive" } }
    ];
  }
  if (statusFilter) whereClause.status = statusFilter as Prisma.EnumMemberStatusFilter;
  if (relFilter) whereClause.relationship = relFilter as MemberRelationship;

  const members = await prisma.member.findMany({
    where: whereClause,
    include: { package: true, benefitTier: true },
    orderBy: { createdAt: "desc" }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUSPENDED": return "bg-[#FFC107]/10 text-[#856404]";
      case "LAPSED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Roster</h1>
          <p className="text-avenue-text-body font-body mt-1">Manage your active members and dependants.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/hr/roster/import" className="px-4 py-2 bg-white text-avenue-text-body border border-[#EEEEEE] rounded-full text-sm font-semibold hover:bg-[#F8F9FA] transition-colors flex items-center">
             <FileSpreadsheet className="w-4 h-4 mr-2" />
             Bulk Import
          </Link>
          <button className="px-4 py-2 bg-white text-avenue-text-body border border-[#EEEEEE] rounded-full text-sm font-semibold hover:bg-[#F8F9FA] transition-colors flex items-center">
             <Download className="w-4 h-4 mr-2" />
             Export CSV
          </button>
          <Link href="/hr/roster/new" className="px-5 py-2 bg-avenue-indigo text-white rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors flex items-center shadow-md">
            <Plus className="w-4 h-4 mr-2" />
            Add Member
          </Link>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="p-4 border-b border-[#EEEEEE] bg-[#F8F9FA] flex flex-col md:flex-row gap-4">
          <form className="flex-1 flex items-center bg-white border border-[#EEEEEE] rounded-full px-4 py-2 focus-within:border-avenue-indigo transition-colors shadow-sm">
            <Search className="w-4 h-4 text-avenue-text-muted mr-3 shrink-0" />
            <input 
              name="q"
              defaultValue={q}
              type="text" 
              placeholder="Search by name, ID, or member number..." 
              className="w-full text-sm outline-none bg-transparent"
            />
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            {relFilter && <input type="hidden" name="relationship" value={relFilter} />}
          </form>
          
          <RosterFilters statusFilter={statusFilter} relFilter={relFilter} />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-white border-b border-[#EEEEEE] text-avenue-text-muted font-heading text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Member</th>
                <th className="px-6 py-4 font-bold">Member No.</th>
                <th className="px-6 py-4 font-bold">Relationship</th>
                <th className="px-6 py-4 font-bold">Package & Tier</th>
                <th className="px-6 py-4 font-bold">Enrolled Date</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-[#F8F9FA] transition-colors group">
                  <td className="px-6 py-4">
                     <div className="font-bold text-avenue-text-heading">{m.firstName} {m.lastName}</div>
                     <div className="text-xs text-avenue-text-muted mt-0.5">{m.phone || m.email || "No contact info"}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{m.memberNumber}</td>
                  <td className="px-6 py-4">
                     <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                        {m.relationship}
                     </span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="text-avenue-text-heading font-semibold">{m.package.name}</div>
                     {m.benefitTier && <div className="text-xs text-avenue-indigo mt-0.5">{m.benefitTier.name}</div>}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">{new Date(m.enrollmentDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                     <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadge(m.status)}`}>
                        {m.status.replace(/_/g, " ")}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                       href={`/hr/roster/${m.id}`} 
                       className="text-avenue-indigo hover:text-avenue-secondary inline-flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      <span className="text-xs font-bold">View</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-avenue-text-body">
                     No members matching your filters.
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
