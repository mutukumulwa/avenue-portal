import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Building2, BriefcaseMedical, Calendar, Phone, Mail, Hash, AlertCircle } from "lucide-react";
import Link from "next/link";

export default async function HRProfilePage() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;

  if (!groupId) {
    return <div className="p-8">No group assigned.</div>;
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { package: true, broker: true }
  });

  if (!group) return null;

  const daysToRenewal = Math.ceil((new Date(group.renewalDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
  const isRenewingSoon = daysToRenewal <= 60 && daysToRenewal > 0;
  const isExpired = daysToRenewal <= 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Group Profile</h1>
          <p className="text-avenue-text-body font-body mt-1">Review your corporate information and active package details.</p>
        </div>
        <Link href="/hr/support" className="px-4 py-2 bg-white text-avenue-text-body border border-[#EEEEEE] rounded-full text-sm font-semibold hover:bg-[#F8F9FA] transition-colors shadow-sm">
           Request Changes
        </Link>
      </div>

      {(isRenewingSoon || isExpired) && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${isExpired ? 'bg-[#DC3545]/10 border-[#DC3545]/20 text-[#DC3545]' : 'bg-[#FFC107]/10 border-[#FFC107]/20 text-[#856404]'}`}>
           <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
           <div>
              <h3 className="font-bold text-sm">
                 {isExpired ? "Package Expired" : "Renewal Approaching"}
              </h3>
              <p className="text-sm mt-1">
                 {isExpired 
                    ? `Your coverage expired on ${new Date(group.renewalDate).toLocaleDateString()}. Please contact Avenue Healthcare immediately.` 
                    : `Your coverage is due for renewal in ${daysToRenewal} days (on ${new Date(group.renewalDate).toLocaleDateString()}). Please submit your renewal endorsement.`}
              </p>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Organization Details */}
        <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
          <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
             <Building2 className="w-5 h-5 text-avenue-indigo mr-2" />
             <h2 className="font-bold text-avenue-text-heading font-heading">Organization Details</h2>
          </div>
          <div className="p-5 space-y-5">
             <div>
                <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Company Name</div>
                <div className="font-semibold text-avenue-text-heading text-lg">{group.name}</div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
               <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Industry</div>
                  <div className="font-semibold text-avenue-text-heading">{group.industry || "—"}</div>
               </div>
               <div>
                  <div className="flex items-center gap-1.5 mb-1 text-avenue-text-muted">
                    <Hash className="w-3.5 h-3.5" />
                    <div className="text-xs font-bold uppercase tracking-wider">Registration No.</div>
                  </div>
                  <div className="font-semibold text-avenue-text-heading">{group.registrationNumber || "—"}</div>
               </div>
             </div>

             <div className="pt-4 border-t border-[#EEEEEE]">
                <h3 className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-3">Primary Contact</h3>
                <div className="font-semibold text-avenue-text-heading mb-2">{group.contactPersonName}</div>
                <div className="flex items-center text-sm mb-1.5">
                   <Phone className="w-4 h-4 text-avenue-text-muted mr-2" />
                   <span className="text-avenue-text-body">{group.contactPersonPhone}</span>
                </div>
                <div className="flex items-center text-sm">
                   <Mail className="w-4 h-4 text-avenue-text-muted mr-2" />
                   <span className="text-avenue-text-body">{group.contactPersonEmail}</span>
                </div>
             </div>
          </div>
        </div>

        {/* Coverage Details */}
        <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
          <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
             <BriefcaseMedical className="w-5 h-5 text-avenue-indigo mr-2" />
             <h2 className="font-bold text-avenue-text-heading font-heading">Active Package</h2>
          </div>
          <div className="p-5 space-y-5">
             <div>
                <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Assigned Package</div>
                <div className="font-bold text-avenue-indigo text-lg">{group.package.name}</div>
                <p className="text-sm text-avenue-text-muted mt-1">{group.package.description || "Corporate Health Cover"}</p>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
               <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Overall Limit</div>
                  <div className="font-semibold text-avenue-text-heading">KES {Number(group.package.annualLimit).toLocaleString()}</div>
               </div>
               <div>
                  <div className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-1">Payment Frequency</div>
                  <div className="font-semibold text-avenue-text-heading capitalize">{group.paymentFrequency.toLowerCase()}</div>
               </div>
               <div>
                  <div className="flex items-center gap-1.5 mb-1 text-avenue-text-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    <div className="text-xs font-bold uppercase tracking-wider">Effective Date</div>
                  </div>
                  <div className="font-semibold text-avenue-text-heading">{new Date(group.effectiveDate).toLocaleDateString()}</div>
               </div>
               <div>
                  <div className="flex items-center gap-1.5 mb-1 text-avenue-text-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    <div className="text-xs font-bold uppercase tracking-wider">Renewal Date</div>
                  </div>
                  <div className="font-semibold text-avenue-text-heading">{new Date(group.renewalDate).toLocaleDateString()}</div>
               </div>
             </div>

             {group.broker && (
               <div className="pt-4 border-t border-[#EEEEEE]">
                  <h3 className="text-xs font-bold text-avenue-text-muted uppercase tracking-wider mb-3">Intermediary</h3>
                  <div className="font-semibold text-avenue-text-heading">{group.broker.name}</div>
                  <div className="text-sm text-avenue-text-body mt-1">{group.broker.contactPerson} &mdash; {group.broker.phone}</div>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
