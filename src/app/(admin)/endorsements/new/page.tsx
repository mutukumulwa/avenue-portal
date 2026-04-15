import { requireRole, ROLES } from "@/lib/rbac";
import { GroupsService } from "@/server/services/groups.service";
import { prisma } from "@/lib/prisma";
import { EndorsementForm } from "./EndorsementForm";

export default async function NewEndorsementPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);

  const { groupId: preselectedGroupId } = await searchParams;
  const tenantId = session.user.tenantId;

  const [groups, packages] = await Promise.all([
    GroupsService.getGroups(tenantId),
    prisma.package.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true, annualLimit: true, contributionAmount: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // For member-level endorsements, load members per group on client — pass group→members map
  const groupMembers = await prisma.member.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: {
      id: true, firstName: true, lastName: true,
      memberNumber: true, relationship: true, groupId: true,
    },
    orderBy: [{ groupId: "asc" }, { firstName: "asc" }],
  });

  const safeGroups = groups.map(g => ({
    id: g.id, name: g.name,
    contributionRate: Number(g.contributionRate),
    renewalDate: g.renewalDate.toISOString(),
  }));

  const safePackages = packages.map(p => ({
    id: p.id, name: p.name,
    annualLimit: Number(p.annualLimit),
    contributionAmount: Number(p.contributionAmount),
  }));

  const safeMembers = groupMembers.map(m => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName} (${m.memberNumber})`,
    groupId: m.groupId,
    relationship: m.relationship,
  }));

  return (
    <EndorsementForm
      groups={safeGroups}
      packages={safePackages}
      members={safeMembers}
      preselectedGroupId={preselectedGroupId ?? null}
    />
  );
}
