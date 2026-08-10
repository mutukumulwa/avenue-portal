import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { effectivePermissions, permitted } from "@/lib/authz/catalog";

// ─── PROD-BLOCKER-1: baseline-backed authorization ───────────────────────────
//
// Production has ZERO Role/Permission/UserRoleAssignment rows. Read purely from
// UserRoleAssignment, getUserPermissions/hasPermission/hasRole return
// []/false/FORBIDDEN for EVERYONE — including SUPER_ADMIN — so every surface
// gated on this service fails closed, and rbac.service's own assignRole
// (requires ROLE:ASSIGN, below) can never mint the first assignment: a bootstrap
// deadlock.
//
// The fix mirrors the hybrid model the session layer already uses
// (effectivePermissions/hasPerm in src/lib/authz/catalog.ts, loadUserPermissions
// in src/lib/auth-credentials.ts): effective authority = the enum-role baseline
// from the canonical catalog UNION the dynamic UserRoleAssignment overlay. The
// overlay is strictly ADDITIVE (catalog decision D2-b) — it only ever adds, so a
// role with zero dynamic rows resolves to EXACTLY its documented baseline (never
// a superset), and revoking a baseline right is a role change, not a row delete.
//
// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface RbacContext {
  userId: string;
  tenantId: string;
}

// ─── RBAC SERVICE ────────────────────────────────────────────────────────────

export const rbacService = {
  /**
   * Returns all effective permission codes for a user: the enum-role baseline
   * from the canonical catalog UNION the dynamic UserRoleAssignment overlay.
   * Used for per-request checks.
   *
   * With zero dynamic rows (production today) this returns exactly the role's
   * baseline — for SUPER_ADMIN that is the "*" wildcard, so callers must test
   * results with permitted() (as hasPermission does), which understands it.
   * The baseline lookup is tenant-scoped, matching the dynamic overlay's scope.
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    const [assignments, user] = await Promise.all([
      prisma.userRoleAssignment.findMany({
        where: { userId, tenantId, isActive: true, status: "ACTIVE" },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: { select: { code: true } } },
              },
            },
          },
        },
      }),
      prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { role: true },
      }),
    ]);

    const dynamic = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.permissions) {
        dynamic.add(rp.permission.code);
      }
    }
    return effectivePermissions(user?.role ?? null, [...dynamic]);
  },

  /**
   * Returns all active role codes for a user.
   */
  async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId, tenantId, isActive: true, status: "ACTIVE" },
      include: { role: { select: { code: true } } },
    });
    return assignments.map((a) => a.role.code);
  },

  /**
   * Checks whether a user has a specific permission.
   * Use this in service/router guards rather than checking User.role directly.
   *
   * Resolves the same baseline∪overlay set as getUserPermissions and matches via
   * permitted(), so SUPER_ADMIN's "*" baseline satisfies every code even with no
   * dynamic rows — the fix for the ROLE:ASSIGN bootstrap deadlock and for every
   * quotation/intake/binding/override/role-admin gate that read this service.
   */
  async hasPermission(
    userId: string,
    permission: string,
    tenantId: string,
  ): Promise<boolean> {
    const permissions = await rbacService.getUserPermissions(userId, tenantId);
    return permitted(permissions, permission);
  },

  /**
   * Checks whether a user holds a specific role code.
   *
   * Baseline fallback: a user's enum role IS a role they effectively hold, even
   * with zero dynamic UserRoleAssignment rows (production today). This mirrors
   * the seed's enum→assignment migration and unblocks role-gated flows such as
   * override approval by a baseline SUPER_ADMIN. Only the enum roles have a
   * baseline; provider persona roles are dynamic-only by design, so a persona
   * check still requires an assignment.
   */
  async hasRole(userId: string, roleCode: string, tenantId: string): Promise<boolean> {
    const count = await prisma.userRoleAssignment.count({
      where: {
        userId,
        tenantId,
        isActive: true,
        status: "ACTIVE",
        role: { code: roleCode },
      },
    });
    if (count > 0) return true;

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true },
    });
    return user?.role === roleCode;
  },

  /**
   * Asserts a user has a permission; throws FORBIDDEN if not.
   * Use at the top of tRPC procedures or service methods.
   */
  async requirePermission(userId: string, permission: string, tenantId: string): Promise<void> {
    const ok = await rbacService.hasPermission(userId, permission, tenantId);
    if (!ok) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission required: ${permission}`,
      });
    }
  },

  /**
   * Initiates a role assignment (maker step).
   * Returns a UserRoleAssignment in PENDING_APPROVAL status.
   * The maker cannot also be the checker (enforced in approveRoleAssignment).
   */
  async assignRole(
    userId: string,
    roleCode: string,
    tenantId: string,
    makerId: string,
    expiresAt?: Date,
  ) {
    await rbacService.requirePermission(makerId, "ROLE:ASSIGN", tenantId);

    const role = await prisma.role.findUnique({
      where: { tenantId_code: { tenantId, code: roleCode } },
    });
    if (!role || !role.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Role '${roleCode}' not found` });
    }

    // Check for an already active assignment
    const existing = await prisma.userRoleAssignment.findFirst({
      where: { userId, roleId: role.id, tenantId, isActive: true, status: "ACTIVE" },
    });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "User already has this role" });
    }

    return prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId: role.id,
        tenantId,
        makerId,
        status: "PENDING_APPROVAL",
        isActive: false, // not active until checker approves
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
  },

  /**
   * Approves a pending role assignment (checker step).
   * Enforces checker ≠ maker.
   */
  async approveRoleAssignment(assignmentId: string, checkerId: string, tenantId: string) {
    await rbacService.requirePermission(checkerId, "ROLE:APPROVE_ASSIGNMENT", tenantId);

    const assignment = await prisma.userRoleAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
    }
    if (assignment.status !== "PENDING_APPROVAL") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Assignment is not pending approval" });
    }
    if (assignment.makerId === checkerId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Maker and checker must be different users",
      });
    }

    return prisma.userRoleAssignment.update({
      where: { id: assignmentId },
      data: { status: "ACTIVE", isActive: true, checkerId, assignedAt: new Date() },
    });
  },

  /**
   * Revokes an active role assignment.
   */
  async revokeRole(assignmentId: string, revokerId: string, tenantId: string) {
    await rbacService.requirePermission(revokerId, "ROLE:REVOKE", tenantId);

    const assignment = await prisma.userRoleAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
    }
    if (!assignment.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Assignment is already inactive" });
    }

    return prisma.userRoleAssignment.update({
      where: { id: assignmentId },
      data: { status: "REVOKED", isActive: false, revokedAt: new Date(), revokedById: revokerId },
    });
  },

  /**
   * Lists all roles available in a tenant.
   */
  async listRoles(tenantId: string) {
    return prisma.role.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: "asc" },
    });
  },

  /**
   * Lists all permissions (system-wide, not tenant-specific).
   */
  async listPermissions() {
    return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
  },

  /**
   * Lists role assignments for a user (or all users in tenant if userId is omitted).
   */
  async listAssignments(tenantId: string, userId?: string) {
    return prisma.userRoleAssignment.findMany({
      where: { tenantId, ...(userId ? { userId } : {}), isActive: true },
      include: {
        role: { select: { code: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
  },

  /**
   * Lists assignments awaiting checker approval.
   */
  async listPendingAssignments(tenantId: string) {
    return prisma.userRoleAssignment.findMany({
      where: { tenantId, status: "PENDING_APPROVAL" },
      include: {
        role: { select: { code: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { assignedAt: "asc" },
    });
  },
};
