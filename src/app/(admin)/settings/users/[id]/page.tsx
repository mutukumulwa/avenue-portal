import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { ROLE_GRANTS, effectivePermissions, ALL_PERMISSIONS } from "@/lib/authz/catalog";
import type { UserRole } from "@/lib/authz/roles";
import { ArrowLeft, ShieldCheck, KeyRound, Building2, CircleAlert } from "lucide-react";
import { revokeAssignmentAction } from "./actions";

/**
 * DEF-002 (S2) — the effective-access detail surface.
 *
 * Users & Access previously showed only enum role, status and last login, on a
 * flat table with no detail view. An operator could not verify or reopen a
 * user's dynamic role assignments, permission set, scope bindings, maker/checker
 * state or expiry — so least-privilege access could not be audited from the
 * front end, and the UAT could not provision or verify a single persona.
 *
 * The effective permission set here is computed by `effectivePermissions`, the
 * SAME function src/lib/auth.ts uses to build the session. Display and
 * enforcement therefore cannot drift: if this page is wrong, the session is
 * wrong in exactly the same way.
 */
export default async function UserAccessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const user = await prisma.user.findFirst({
    where: { id, tenantId },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true,
      isActive: true, lastLoginAt: true, createdAt: true, sessionVersion: true,
      totpEnabled: true,
      group: { select: { id: true, name: true } },
      broker: { select: { id: true, name: true } },
      member: { select: { id: true, memberNumber: true, firstName: true, lastName: true } },
      provider: { select: { id: true, name: true } },
      managedFundGroups: { select: { id: true, name: true } },
    },
  });
  if (!user) notFound();

  const assignments = await prisma.userRoleAssignment.findMany({
    where: { tenantId, userId: user.id },
    include: {
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  const activeAssignments = assignments.filter(
    (a) => a.isActive && a.status === "ACTIVE" && (!a.expiresAt || a.expiresAt > new Date()),
  );

  const dynamicCodes = [
    ...new Set(activeAssignments.flatMap((a) => a.role.permissions.map((p) => p.permission.code))),
  ];
  const baseline = [...(ROLE_GRANTS[user.role as UserRole] ?? [])];
  const effective = effectivePermissions(user.role, dynamicCodes).sort();
  const overlayOnly = dynamicCodes.filter((c) => !baseline.includes(c)).sort();
  const isWildcard = effective.includes(ALL_PERMISSIONS);

  const actorIds = [
    ...new Set(assignments.flatMap((a) => [a.makerId, a.checkerId, a.revokedById].filter(Boolean) as string[])),
  ];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds }, tenantId },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const scopes: { label: string; value: string; icon: React.ElementType }[] = [];
  if (user.group) scopes.push({ label: "HR group", value: user.group.name, icon: Building2 });
  if (user.broker) scopes.push({ label: "Broker", value: user.broker.name, icon: Building2 });
  if (user.provider) scopes.push({ label: "Provider", value: user.provider.name, icon: Building2 });
  if (user.member)
    scopes.push({
      label: "Linked member",
      value: `${user.member.memberNumber} — ${user.member.firstName} ${user.member.lastName}`,
      icon: KeyRound,
    });
  for (const fg of user.managedFundGroups)
    scopes.push({ label: "Fund scheme", value: fg.name, icon: Building2 });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-indigo hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Users &amp; Access
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-text-heading font-heading">
          {user.firstName} {user.lastName}
        </h1>
        <p className="text-brand-text-body font-body mt-1">{user.email}</p>
      </div>

      {/* Identity and status */}
      <section className="grid gap-4 md:grid-cols-4">
        <Fact label="Portal role" value={user.role.replace(/_/g, " ")} />
        <Fact label="Status" value={user.isActive ? "Active" : "Inactive"} />
        <Fact
          label="Last login"
          value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-UG") : "Never"}
        />
        <Fact label="Authenticator" value={user.totpEnabled ? "Enrolled" : "Not enrolled"} />
      </section>

      {/* Effective access — the decision that actually applies */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-indigo" />
          <h2 className="text-lg font-bold text-brand-text-heading font-heading">Effective access</h2>
        </div>
        <p className="text-xs text-brand-text-muted">
          Computed by the same function that builds this user&apos;s session: the permissions
          granted by their portal role, plus any additional permissions from active dynamic role
          assignments. The overlay only ever adds — removing a baseline permission means changing
          the role.
        </p>

        {isWildcard ? (
          <div className="flex items-start gap-2 rounded-[8px] border border-[#FFC107]/40 bg-[#FFC107]/10 px-4 py-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#856404]" />
            <p className="text-sm text-[#856404]">
              This user holds the <strong>full-access wildcard</strong> and is not limited by the
              permission list below.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <PermissionList
              title={`From portal role (${user.role.replace(/_/g, " ")})`}
              codes={[...baseline].sort()}
              empty="This role grants no baseline permissions."
            />
            <PermissionList
              title="Added by dynamic role assignments"
              codes={overlayOnly}
              empty="No additional permissions beyond the portal role."
            />
          </div>
        )}

        <details className="rounded-[8px] border border-[#EEEEEE] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand-text-heading">
            Combined effective permission set ({isWildcard ? "all" : effective.length})
          </summary>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {effective.map((code) => (
              <code key={code} className="rounded bg-[#F8F9FA] px-2 py-0.5 text-[11px] text-brand-text-body">
                {code}
              </code>
            ))}
          </div>
        </details>
      </section>

      {/* Scope */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-brand-text-heading font-heading">Scope</h2>
        {scopes.length === 0 ? (
          <p className="text-sm text-brand-text-muted">
            No client, group, provider, member or fund scope is bound. This user is scoped to the
            tenant only.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {scopes.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-center gap-3 rounded-[8px] border border-[#EEEEEE] bg-white px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-brand-text-muted" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">{s.label}</p>
                    <p className="text-sm text-brand-text-heading">{s.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dynamic role assignments, including revoked/expired history */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-brand-text-heading font-heading">
          Dynamic role assignments
        </h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-brand-text-muted">
            No dynamic role assignments. This user&apos;s access comes entirely from their portal
            role.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#EEEEEE] bg-[#E6E7E8] font-semibold text-[#6C757D]">
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Effective</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3">Maker</th>
                  <th className="px-5 py-3">Checker</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
                {assignments.map((a) => {
                  const expired = !!a.expiresAt && a.expiresAt <= new Date();
                  const live = a.isActive && a.status === "ACTIVE" && !expired;
                  return (
                    <tr key={a.id} className={live ? "" : "opacity-60"}>
                      <td className="px-5 py-3 font-semibold text-brand-text-heading">{a.role.code}</td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-[#6C757D]/10 px-3 py-1 text-[10px] font-bold uppercase text-[#6C757D]">
                          {expired && a.status === "ACTIVE" ? "EXPIRED" : a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">{new Date(a.assignedAt).toLocaleDateString("en-UG")}</td>
                      <td className="px-5 py-3">
                        {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString("en-UG") : "—"}
                      </td>
                      <td className="px-5 py-3">{nameOf(actors, a.makerId)}</td>
                      <td className="px-5 py-3">{nameOf(actors, a.checkerId)}</td>
                      <td className="px-5 py-3">
                        {live ? (
                          <form action={revokeAssignmentAction}>
                            <input type="hidden" name="assignmentId" value={a.id} />
                            <input type="hidden" name="userId" value={user.id} />
                            <button
                              type="submit"
                              className="text-xs font-bold text-brand-error hover:underline"
                            >
                              Revoke
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-brand-text-muted">
                            {a.revokedAt ? `Revoked ${new Date(a.revokedAt).toLocaleDateString("en-UG")}` : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-brand-text-muted">
          Revoked and expired assignments stay listed: removing a right must not erase the record
          that it was once held.
        </p>
      </section>
    </div>
  );
}

function nameOf(
  actors: { id: string; firstName: string; lastName: string }[],
  uid: string | null,
) {
  if (!uid) return "—";
  const a = actors.find((x) => x.id === uid);
  return a ? `${a.firstName} ${a.lastName}` : uid;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-brand-text-heading">{value}</p>
    </div>
  );
}

function PermissionList({
  title,
  codes,
  empty,
}: {
  title: string;
  codes: string[];
  empty: string;
}) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4">
      <p className="mb-2 text-sm font-semibold text-brand-text-heading">{title}</p>
      {codes.length === 0 ? (
        <p className="text-xs text-brand-text-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {codes.map((code) => (
            <code key={code} className="rounded bg-[#F8F9FA] px-2 py-0.5 text-[11px] text-brand-text-body">
              {code}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}
