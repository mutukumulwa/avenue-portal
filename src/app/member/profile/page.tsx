import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { User, Shield } from "lucide-react";
import { ProfileForm } from "./ProfileForm";

export default async function MemberProfilePage() {
  const session = await requireRole(ROLES.MEMBER);

  const member = session.user.memberId
    ? await prisma.member.findUnique({
        where: { id: session.user.memberId },
        select: {
          firstName: true,
          lastName: true,
          memberNumber: true,
          idNumber: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
          email: true,
          enrollmentDate: true,
          status: true,
          package: { select: { name: true } },
          group: { select: { name: true } },
        },
      })
    : null;

  if (!member) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center text-avenue-text-muted">
        No member profile found for this account.
      </div>
    );
  }

  const readonlyFields = [
    { label: "Member Number",   value: member.memberNumber },
    { label: "National ID",     value: member.idNumber || "—" },
    { label: "Date of Birth",   value: new Date(member.dateOfBirth).toLocaleDateString("en-KE", { dateStyle: "long" }) },
    { label: "Gender",          value: member.gender },
    { label: "Group / Employer",value: member.group.name },
    { label: "Package",         value: member.package.name },
    { label: "Enrolled",        value: new Date(member.enrollmentDate).toLocaleDateString("en-KE", { dateStyle: "long" }) },
    { label: "Status",          value: member.status.replace(/_/g, " ") },
  ];

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">My Profile</h1>
        <p className="text-avenue-text-muted mt-1 text-sm">Review your membership details and update contact information.</p>
      </div>

      {/* Identity card (read-only) */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EEEEEE]">
          <div className="w-9 h-9 bg-avenue-indigo/10 rounded-full flex items-center justify-center">
            <User size={16} className="text-avenue-indigo" />
          </div>
          <div>
            <p className="font-bold text-avenue-text-heading">{member.firstName} {member.lastName}</p>
            <p className="text-xs text-avenue-text-muted font-mono">{member.memberNumber}</p>
          </div>
          <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
            member.status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"
          }`}>
            {member.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {readonlyFields.map(f => (
            <div key={f.label} className="flex items-center justify-between px-5 py-3">
              <span className="text-xs font-bold text-avenue-text-muted uppercase">{f.label}</span>
              <span className="text-sm text-avenue-text-heading font-semibold">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Editable contact details */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-avenue-indigo" />
          <h2 className="font-bold text-avenue-text-heading font-heading">Contact Details</h2>
        </div>
        <p className="text-xs text-avenue-text-muted">
          You can update your phone number and email. Name, DOB, and membership details require Avenue&apos;s approval — contact support to request changes.
        </p>
        <ProfileForm member={member} />
      </div>
    </div>
  );
}
