import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { GroupsService } from "@/server/services/groups.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { MemberNewForm } from "./MemberNewForm";

export default async function RegisterMemberPage() {
  const session = await requireRole(ROLES.OPS);

  const groups = await GroupsService.getGroups(session.user.tenantId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/members" className="text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Register Member</h1>
          <p className="text-avenue-text-body mt-1 text-sm">Enrol a new principal or dependent.</p>
        </div>
      </div>
      <MemberNewForm groups={groups.map(g => ({ id: g.id, name: g.name }))} />
    </div>
  );
}
