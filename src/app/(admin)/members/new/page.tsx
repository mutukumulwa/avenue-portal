import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { GroupsService } from "@/server/services/groups.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { MemberNewForm } from "./MemberNewForm";

export default async function RegisterMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ principalId?: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const { principalId } = await searchParams;

  const groups = await GroupsService.getGroups(session.user.tenantId, session.user.clientId);

  // NW-D02: when opened via a principal's "Add Dependent" action, resolve the
  // principal so the form can lock the scheme and link the new dependant to it.
  let principal:
    | { id: string; name: string; memberNumber: string; groupId: string; groupName: string }
    | null = null;
  if (principalId) {
    const p = await prisma.member.findFirst({
      where: { id: principalId, tenantId: session.user.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberNumber: true,
        relationship: true,
        groupId: true,
        group: { select: { name: true } },
      },
    });
    if (p && p.relationship === "PRINCIPAL") {
      principal = {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        memberNumber: p.memberNumber,
        groupId: p.groupId,
        groupName: p.group?.name ?? "—",
      };
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          href={principal ? `/members/${principal.id}` : "/members"}
          className="text-brand-text-muted hover:text-brand-text-heading transition-colors"
         aria-label="Back to principal">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">
            {principal ? "Add Dependent" : "Register Member"}
          </h1>
          <p className="text-brand-text-body mt-1 text-sm">
            {principal
              ? `Enrol a dependant under ${principal.name} (${principal.memberNumber}).`
              : "Enrol a new principal or dependent."}
          </p>
        </div>
      </div>
      {/* UAT-HF P04.02: the draft store keys on tenant + user so a second
          operator at the same desk cannot be shown the first one's typed PII. */}
      <MemberNewForm
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        principal={principal}
        draftScope={{ tenantId: session.user.tenantId, userId: session.user.id }}
      />
    </div>
  );
}
