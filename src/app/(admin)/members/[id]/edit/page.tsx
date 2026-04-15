import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { MembersService } from "@/server/services/members.service";
import { MemberEditForm } from "./MemberEditForm";

export default async function MemberEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const member = await MembersService.getMemberById(session.user.tenantId, id);
  if (!member) notFound();

  const snap = {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    otherNames: (member as { otherNames?: string | null }).otherNames ?? null,
    idNumber: member.idNumber ?? null,
    dateOfBirth: member.dateOfBirth.toISOString(),
    gender: member.gender,
    phone: member.phone ?? null,
    email: member.email ?? null,
    relationship: member.relationship,
    status: member.status,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/members/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Edit Member</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">{member.firstName} {member.lastName} · {member.memberNumber}</p>
        </div>
      </div>
      <MemberEditForm member={snap} />
    </div>
  );
}
