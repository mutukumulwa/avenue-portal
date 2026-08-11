import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { PROVIDER_ROLE_LABELS } from "@/components/layouts/provider-nav-model";
import { PROVIDER_PERSONA_ROLE_CODES } from "@/../prisma/seeds/provider-rbac";
import { ProviderUsersManager } from "./ProviderUsersManager";

/**
 * ELIG-GAP-005 — provider self-service user administration UI.
 *
 * Fail-CLOSED gate: a provider user must hold `provider.users.manage` (checked
 * with the strict hasPermission, not the legacy-tolerant providerPermits). Lists
 * this facility's own provider users with their active roles + branch access.
 */
export default async function ProviderUsersPage() {
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!ProviderAccessService.hasPermission(ctx, "provider.users.manage")) redirect("/unauthorized");

  const [users, branches, roles] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, role: "PROVIDER_USER" },
      select: {
        id: true, firstName: true, lastName: true, email: true, isActive: true,
        roleAssignments: {
          where: { isActive: true, status: "ACTIVE" },
          select: { role: { select: { code: true } } },
        },
        providerBranchAssignments: {
          where: { activeTo: null },
          select: { providerBranch: { select: { name: true } } },
        },
      },
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
    }),
    prisma.providerBranch.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      where: { tenantId: ctx.tenantId, code: { in: [...PROVIDER_PERSONA_ROLE_CODES] }, isActive: true },
      select: { code: true },
    }),
  ]);

  const personaRoles = roles
    .filter((r) => PROVIDER_PERSONA_ROLE_CODES.includes(r.code))
    .map((r) => ({ code: r.code, label: PROVIDER_ROLE_LABELS[r.code] ?? r.code }));

  const rows = users.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    email: u.email,
    isActive: u.isActive,
    // Own row is flagged so the UI hides self-suspend (the service's last-admin
    // guard is the real boundary; this is just to avoid a confusing self-action).
    isSelf: u.id === ctx.actorId,
    roles: u.roleAssignments.map((a) => ({ code: a.role.code, label: PROVIDER_ROLE_LABELS[a.role.code] ?? a.role.code })),
    branchNames: u.providerBranchAssignments.map((b) => b.providerBranch.name),
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Users size={22} className="text-brand-text-heading" />
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Provider users</h1>
          <p className="text-brand-text-muted text-sm">Manage {provider.name}&apos;s staff — duty roles and branch access.</p>
        </div>
      </div>

      <ProviderUsersManager users={rows} branches={branches} personaRoles={personaRoles} />
    </div>
  );
}
