import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { User, Plus } from "lucide-react";

export default async function MemberDependentsPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      member: {
        include: {
          dependents: { orderBy: { relationship: "asc" } },
        },
      },
    },
  });

  const member = user?.member;
  if (!member) redirect("/login");

  const age = (dob: Date) => {
    const years = new Date().getFullYear() - dob.getFullYear();
    return years;
  };

  const statusColor = (status: string) =>
    status === "ACTIVE" ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">My Dependents</h1>
          <p className="text-avenue-text-muted mt-1">Family members covered under your plan.</p>
        </div>
        <button className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full font-semibold text-sm transition-colors flex items-center gap-2 shadow-sm">
          <Plus size={16} /> Add Dependent
        </button>
      </div>

      <div className="space-y-3">
        {/* Principal card (self) */}
        <div className="bg-white border-2 border-avenue-indigo/20 rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-avenue-indigo/10 rounded-full flex items-center justify-center">
              <User size={22} className="text-avenue-indigo" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-avenue-text-heading">{member.firstName} {member.lastName}</p>
                <span className="bg-avenue-indigo/10 text-avenue-indigo px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">Principal</span>
              </div>
              <p className="text-xs text-avenue-text-muted mt-0.5">{member.memberNumber} · Age {age(member.dateOfBirth)}</p>
            </div>
            <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(member.status)}`}>
              {member.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {member.dependents.map((dep) => (
          <div key={dep.id} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#E6E7E8] rounded-full flex items-center justify-center">
                <User size={22} className="text-[#6C757D]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-avenue-text-heading">{dep.firstName} {dep.lastName}</p>
                  <span className="bg-[#F5C6B6]/50 text-[#a0522d] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">
                    {dep.relationship}
                  </span>
                </div>
                <p className="text-xs text-avenue-text-muted mt-0.5">{dep.memberNumber} · Age {age(dep.dateOfBirth)}</p>
              </div>
              <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(dep.status)}`}>
                {dep.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        ))}

        {member.dependents.length === 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-8 text-center text-avenue-text-body shadow-sm">
            No dependents added yet. Click &quot;Add Dependent&quot; to register family members.
          </div>
        )}
      </div>
    </div>
  );
}
