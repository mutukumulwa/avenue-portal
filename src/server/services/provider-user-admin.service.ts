import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "./provider-access.service";
import { ProviderBranchAssignmentService } from "./provider-branch-assignment.service";
import { PROVIDER_PERSONA_ROLE_CODES } from "@/../prisma/seeds/provider-rbac";

/**
 * PNOS F1.5 — provider user administration & offboarding.
 *
 * A provider administrator (holding provider.users.manage) manages role and
 * branch access for users WITHIN THEIR OWN provider, with least-privilege
 * guardrails that no request body can bypass:
 *  - may only grant PROVIDER PERSONA roles — never a TPA role, never the
 *    deprecated PROVIDER_LEGACY, never a cross-provider user (no escalation);
 *  - suspend revokes the live session (sessionVersion bump) and retires branch
 *    scope immediately;
 *  - a policy-controlled safeguard prevents removing the last provider admin.
 *
 * All actor authority comes from the F1.3 ProviderAccessContext, never a form
 * field. MFA is enforced upstream at requireRole (mustEnrollTotp); this service
 * assumes the actor already cleared that gate.
 */

type Db = PrismaClient | Prisma.TransactionClient;
const MANAGE = "provider.users.manage";

export type ProviderUserAdminErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_PROVIDER"
  | "ROLE_NOT_AVAILABLE"
  | "LAST_ADMIN";

export class ProviderUserAdminError extends Error {
  constructor(public code: ProviderUserAdminErrorCode, message: string) {
    super(message);
    this.name = "ProviderUserAdminError";
  }
}

async function audit(db: Db, args: { actorId: string; tenantId: string; action: string; description: string; entityId: string; metadata: Record<string, string | number | boolean | null> }) {
  await db.auditLog.create({
    data: {
      userId: args.actorId, tenantId: args.tenantId, action: args.action, module: "PROVIDERS",
      description: args.description, entityType: "PROVIDER_USER", entityId: args.entityId, metadata: args.metadata,
    },
  });
}

/**
 * Target must exist in the actor's tenant, be bound to the actor's provider AND
 * be a provider user — a facility administrator never touches a TPA staff or
 * other portal account (Family Hospital UAT P05.04 step 3, "modification of
 * protected platform roles").
 */
async function loadOwnedTarget(db: Db, ctx: ProviderAccessContext, targetUserId: string) {
  const target = await db.user.findFirst({
    where: { id: targetUserId, tenantId: ctx.tenantId },
    select: { id: true, providerId: true, isActive: true, role: true },
  });
  if (!target) throw new ProviderUserAdminError("NOT_FOUND", "No such user");
  if (target.providerId !== ctx.providerId || target.role !== "PROVIDER_USER") {
    throw new ProviderUserAdminError("FORBIDDEN_PROVIDER", "User belongs to another provider");
  }
  return target;
}

/**
 * The administrative permissions of the provider catalogue — the ones that let a
 * holder change who can do what, or connect systems.
 */
export const PROVIDER_ADMINISTRATIVE_PERMISSIONS = [
  "provider.users.manage",
  "provider.api_keys.manage",
  "provider.integrations.manage",
  "provider.profile.change_request",
] as const;

/**
 * Family Hospital UAT P05.04 step 3 / DEC-FH-X6 — no administrative escalation.
 *
 * A persona may be granted by a provider actor only if every ADMINISTRATIVE
 * permission it carries is one the actor already holds: an Admin can onboard
 * front-desk, clinical, billing and finance staff (F1.5's design) and other
 * Admins, but cannot mint an Integration Admin or a Facility Admin — the
 * "stronger persona" the plan's acceptance forbids. Returns the role id.
 */
export async function assertGrantablePersona(db: Db, ctx: ProviderAccessContext, roleCode: string): Promise<string> {
  if (!PROVIDER_PERSONA_ROLE_CODES.includes(roleCode)) {
    throw new ProviderUserAdminError("FORBIDDEN_ROLE", `Not a grantable provider persona role: ${roleCode}`);
  }
  const role = await db.role.findUnique({
    where: { tenantId_code: { tenantId: ctx.tenantId, code: roleCode } },
    select: { id: true, isActive: true, permissions: { select: { permission: { select: { code: true } } } } },
  });
  if (!role || !role.isActive) throw new ProviderUserAdminError("ROLE_NOT_AVAILABLE", "Role not available in tenant");
  const stronger = role.permissions
    .map((p) => p.permission.code)
    .filter((code) => (PROVIDER_ADMINISTRATIVE_PERMISSIONS as readonly string[]).includes(code) && !ctx.permissions.includes(code));
  if (stronger.length > 0) {
    throw new ProviderUserAdminError("FORBIDDEN_ROLE", "You cannot grant a role with administrative access you do not hold yourself.");
  }
  return role.id;
}

/** Active users in a provider who hold provider.users.manage via any active role. */
async function activeAdminUserIds(db: Db, tenantId: string, providerId: string): Promise<Set<string>> {
  const rows = await db.userRoleAssignment.findMany({
    where: {
      tenantId, isActive: true, status: "ACTIVE",
      user: { providerId, isActive: true },
      role: { permissions: { some: { permission: { code: MANAGE } } } },
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export const ProviderUserAdminService = {
  /**
   * Grant a provider persona role to a user in the actor's provider.
   * Rejects TPA roles, PROVIDER_LEGACY, and cross-provider targets. Idempotent.
   */
  async assignRole(ctx: ProviderAccessContext, input: { targetUserId: string; roleCode: string }, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, MANAGE);
    const roleId = await assertGrantablePersona(db, ctx, input.roleCode);
    const target = await loadOwnedTarget(db, ctx, input.targetUserId);
    const role = { id: roleId };

    const existing = await db.userRoleAssignment.findFirst({
      where: { userId: target.id, roleId: role.id, tenantId: ctx.tenantId, isActive: true, status: "ACTIVE" },
    });
    if (existing) return existing; // idempotent

    const created = await db.userRoleAssignment.create({
      data: { userId: target.id, roleId: role.id, tenantId: ctx.tenantId, isActive: true, status: "ACTIVE", makerId: ctx.actorId, checkerId: ctx.actorId },
    });
    await audit(db, { actorId: ctx.actorId, tenantId: ctx.tenantId, action: "PROVIDER_USER_ROLE_GRANTED", description: "Provider persona role granted", entityId: target.id, metadata: { roleCode: input.roleCode, providerId: ctx.providerId } });
    return created;
  },

  /** Revoke a previously granted provider role (idempotent). */
  async revokeRole(ctx: ProviderAccessContext, input: { targetUserId: string; roleCode: string }, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, MANAGE);
    const target = await loadOwnedTarget(db, ctx, input.targetUserId);
    const role = await db.role.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: input.roleCode } } });
    if (!role) throw new ProviderUserAdminError("ROLE_NOT_AVAILABLE", "Role not available in tenant");

    // Last-admin safeguard: revoking a manage-granting role from the final admin is blocked.
    const grantsManage = await db.rolePermission.findFirst({ where: { roleId: role.id, permission: { code: MANAGE } }, select: { roleId: true } });
    if (grantsManage) {
      const admins = await activeAdminUserIds(db, ctx.tenantId, ctx.providerId);
      if (admins.has(target.id) && admins.size <= 1) {
        throw new ProviderUserAdminError("LAST_ADMIN", "Cannot remove the last provider administrator");
      }
    }

    const res = await db.userRoleAssignment.updateMany({
      where: { userId: target.id, roleId: role.id, tenantId: ctx.tenantId, isActive: true, status: "ACTIVE" },
      data: { isActive: false, status: "REVOKED", revokedAt: new Date(), revokedById: ctx.actorId },
    });
    if (res.count > 0) {
      await audit(db, { actorId: ctx.actorId, tenantId: ctx.tenantId, action: "PROVIDER_USER_ROLE_REVOKED", description: "Provider persona role revoked", entityId: target.id, metadata: { roleCode: input.roleCode, providerId: ctx.providerId } });
    }
    return { revoked: res.count };
  },

  /** Assign a set of branches to a user (idempotent per branch). */
  async assignBranches(ctx: ProviderAccessContext, input: { targetUserId: string; branchIds: string[] }, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, MANAGE);
    const target = await loadOwnedTarget(db, ctx, input.targetUserId);
    const created: string[] = [];
    for (const branchId of input.branchIds) {
      try {
        await ProviderBranchAssignmentService.assign({ tenantId: ctx.tenantId, providerId: ctx.providerId, userId: target.id, providerBranchId: branchId, createdBy: ctx.actorId }, db);
        created.push(branchId);
      } catch (e) {
        // an already-active assignment is fine (idempotent); rethrow anything else
        if (!(e && typeof e === "object" && "code" in e && (e as { code: string }).code === "DUPLICATE_ACTIVE")) throw e;
      }
    }
    return { assigned: created };
  },

  /**
   * Suspend a provider user: deactivate, revoke the live session, and retire
   * every active branch assignment — atomically. Blocked for the last admin.
   */
  async suspendUser(ctx: ProviderAccessContext, input: { targetUserId: string; reason?: string }, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, MANAGE);
    const target = await loadOwnedTarget(db, ctx, input.targetUserId);

    const admins = await activeAdminUserIds(db, ctx.tenantId, ctx.providerId);
    if (admins.has(target.id) && admins.size <= 1) {
      throw new ProviderUserAdminError("LAST_ADMIN", "Cannot suspend the last provider administrator");
    }

    // Deactivate + bump sessionVersion (auth invalidates the stale session within
    // the session-state cache TTL, ~15s — "immediately loses access" per policy).
    await db.user.update({ where: { id: target.id }, data: { isActive: false, sessionVersion: { increment: 1 } } });
    // Retire branch scope now so a lingering session cannot act on any branch.
    const active = await ProviderBranchAssignmentService.activeAssignmentsForUser(target.id, ctx.tenantId, new Date(), db);
    for (const a of active) {
      await ProviderBranchAssignmentService.retire(a.id, { tenantId: ctx.tenantId, retiredBy: ctx.actorId, reason: input.reason ?? "user suspended" }, db);
    }
    await audit(db, { actorId: ctx.actorId, tenantId: ctx.tenantId, action: "PROVIDER_USER_SUSPENDED", description: "Provider user suspended and session revoked", entityId: target.id, metadata: { providerId: ctx.providerId, retiredBranches: active.length, reason: input.reason ?? null } });
    return { suspended: true, retiredBranches: active.length };
  },

  /** Re-activate a suspended user (does not restore branch assignments — re-grant explicitly). */
  async reactivateUser(ctx: ProviderAccessContext, input: { targetUserId: string }, db: Db = prisma) {
    ProviderAccessService.requirePermission(ctx, MANAGE);
    const target = await loadOwnedTarget(db, ctx, input.targetUserId);
    await db.user.update({ where: { id: target.id }, data: { isActive: true } });
    await audit(db, { actorId: ctx.actorId, tenantId: ctx.tenantId, action: "PROVIDER_USER_REACTIVATED", description: "Provider user reactivated", entityId: target.id, metadata: { providerId: ctx.providerId } });
    return { reactivated: true };
  },
} as const;
