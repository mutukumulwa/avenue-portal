import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon, Calendar, Info, Phone, Mail, FileText } from "lucide-react";

export default async function HRMemberDetailPage(
  props: { params: Promise<{ memberId: string }> }
) {
  const params = await props.params;
  const session = await requireRole(ROLES.HR);
  
  const member = await prisma.member.findFirst({
    where: { 
      id: params.memberId,
      groupId: session.user.groupId! 
    },
    include: {
      group: true,
      package: true,
      benefitTier: true,
      dependents: true,
      principal: true,
      endorsements: {
         orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!member) notFound();

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
      <div className="flex items-center space-x-4">
        <Link href="/hr/roster" className="text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{member.firstName} {member.lastName}</h1>
            <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadge(member.status)}`}>
               {member.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-avenue-text-body font-body mt-1">Member #{member.memberNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
             <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
                <UserIcon className="w-5 h-5 text-avenue-indigo mr-2" />
                <h2 className="font-bold text-avenue-text-heading font-heading">Personal Details</h2>
             </div>
             <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Full Name</div>
                  <div className="font-semibold text-avenue-text-heading">{member.firstName} {member.otherNames} {member.lastName}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Gender</div>
                  <div className="font-semibold text-avenue-text-heading">{member.gender}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Date of Birth</div>
                  <div className="font-semibold text-avenue-text-heading">{new Date(member.dateOfBirth).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">National ID</div>
                  <div className="font-semibold text-avenue-text-heading">{member.idNumber || "—"}</div>
                </div>
                <div className="flex items-center">
                   <Phone className="w-4 h-4 text-[#848E9F] mr-2" />
                   <span className="font-semibold text-avenue-text-heading">{member.phone || "—"}</span>
                </div>
                <div className="flex items-center">
                   <Mail className="w-4 h-4 text-[#848E9F] mr-2" />
                   <span className="font-semibold text-avenue-text-heading">{member.email || "—"}</span>
                </div>
             </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
             <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
                <Info className="w-5 h-5 text-avenue-indigo mr-2" />
                <h2 className="font-bold text-avenue-text-heading font-heading">Coverage Details</h2>
             </div>
             <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Package</div>
                  <div className="font-semibold text-avenue-text-heading">{member.package.name}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Benefit Tier</div>
                  <div className="font-semibold text-avenue-text-heading">{member.benefitTier?.name || "Standard"}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Relationship</div>
                  <div className="font-semibold text-avenue-text-heading uppercase text-sm">
                     {member.relationship}
                     {member.principal && ` to ${member.principal.firstName} ${member.principal.lastName}`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                     <Calendar className="w-3.5 h-3.5 text-avenue-text-muted" />
                     <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider">Enrolled Date</div>
                  </div>
                  <div className="font-semibold text-avenue-text-heading">{new Date(member.enrollmentDate).toLocaleDateString()}</div>
                </div>
             </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-[#EEEEEE] px-5 py-4">
              <h2 className="font-bold text-avenue-text-heading font-heading flex justify-between items-center">
                 Related Dependants
                 <span className="bg-avenue-indigo/10 text-avenue-indigo text-xs px-2 py-0.5 rounded-full">{member.dependents.length}</span>
              </h2>
            </div>
            <div className="p-0">
               {member.dependents.length === 0 ? (
                  <div className="p-5 text-sm text-avenue-text-body text-center">No dependants registered.</div>
               ) : (
                  <ul className="divide-y divide-[#EEEEEE]">
                     {member.dependents.map(d => (
                        <li key={d.id} className="p-4 flex justify-between items-center hover:bg-[#F8F9FA] transition-colors">
                           <div>
                              <Link href={`/hr/roster/${d.id}`} className="font-semibold text-sm text-avenue-text-heading hover:text-avenue-indigo transition-colors">
                                 {d.firstName} {d.lastName}
                              </Link>
                              <div className="text-xs text-avenue-text-muted mt-0.5">{d.relationship}</div>
                           </div>
                           <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${getStatusBadge(d.status)}`}>
                             {d.status.replace("_", " ")}
                           </span>
                        </li>
                     ))}
                  </ul>
               )}
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
               <FileText className="w-4 h-4 text-avenue-indigo mr-2" />
               <h2 className="font-bold text-avenue-text-heading font-heading">Endorsement History</h2>
            </div>
            {member.endorsements.length === 0 ? (
               <div className="p-5 text-sm text-avenue-text-body text-center">No history.</div>
            ) : (
               <ul className="divide-y divide-[#EEEEEE] p-0">
                 {member.endorsements.slice(0, 5).map(e => (
                   <li key={e.id} className="p-4">
                      <div className="flex justify-between items-start mb-1">
                         <span className="font-bold text-xs uppercase text-avenue-text-heading">{e.type.replace(/_/g, " ")}</span>
                         <span className="text-[10px] font-bold uppercase text-avenue-text-muted">{e.status}</span>
                      </div>
                      <div className="text-xs text-avenue-text-body">{new Date(e.createdAt).toLocaleDateString()}</div>
                   </li>
                 ))}
               </ul>
            )}
            <div className="bg-[#F8F9FA] p-3 text-center border-t border-[#EEEEEE]">
               <Link href="/hr/endorsements" className="text-xs font-bold text-avenue-indigo hover:text-avenue-secondary transition-colors">View All Endorsements</Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
