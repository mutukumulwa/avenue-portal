import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface RbacContext {
  userId: string;
  tenantId: string;
}

// ─── RBAC SERVICE ────────────────────────────────────────────────────────────

export const rbacService = {
  /**
   * Returns all active permission codes for a user.
   * Used to hydrate session and for per-request checks.
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    const assignments = await prisma.userRoleAssignment.findMany({
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
    });

    const codes = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.permissions) {
        codes.add(rp.permission.code);
      }
    }
    return [...codes];
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
   */
  async hasPermission(
    userId: string,
    permission: string,
    tenantId: string,
  ): Promise<boolean> {
    const count = await prisma.userRoleAssignment.count({
      where: {
        userId,
        tenantId,
        isActive: true,
        status: "ACTIVE",
        role: {
          permissions: {
            some: {
              permission: { code: permission },
            },
          },
        },
      },
    });
    return count > 0;
  },

  /**
   * Checks whether a user holds a specific role code.
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
    return count > 0;
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
