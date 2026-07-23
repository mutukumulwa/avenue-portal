import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F1.2 — provider user↔branch assignment.
 *
 * The resource-scope leg of provider authorization (spec D4): action
 * permissions come from the dynamic RBAC (F1.1); which BRANCHES a provider user
 * may act within comes from these effective, auditable rows. `User.providerId`
 * / `UserRole.PROVIDER_USER` alone is NOT authorization.
 *
 * This service owns create/retire/query only. It does not read sessions, guard
 * routes, or resolve a full access context — that is ProviderAccessService
 * (F1.3), which will consume `activeBranchIdsForUser`. All scope
 * (tenant/provider) is passed in by the trusted caller, never from a request
 * body.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class ProviderBranchAssignmentError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ProviderBranchAssignmentError";
  }
}

export interface AssignInput {
  tenantId: string;
  providerId: string;
  userId: string;
  providerBranchId: string;
  /** Actor performing the assignment (a real user id — recorded on the row + audit). */
  createdBy: string;
  /** Defaults to now. A future value makes the assignment not-yet-effective. */
  activeFrom?: Date;
}

async function writeInlineAudit(
  db: Db,
  args: { actorId: string; tenantId: string; action: string; description: string; entityId: string; metadata: Record<string, string | number | boolean | null> },
) {
  // Direct create (not @/lib/audit.writeAudit) so the service is callable
  // outside a Next.js request context (scripts, tests, jobs) — writeAudit reads
  // request headers. Chain-hash fields stay null, matching the plain-audit path.
  await db.auditLog.create({
    data: {
      userId: args.actorId,
      tenantId: args.tenantId,
      action: args.action,
      module: "PROVIDERS",
      description: args.description,
      entityType: "PROVIDER_USER_BRANCH_ASSIGNMENT",
      entityId: args.entityId,
      metadata: args.metadata,
    },
  });
}

/** An assignment is "active" at `at` when it has begun and has not ended. */
function activeAtFilter(at: Date): Prisma.ProviderUserBranchAssignmentWhereInput {
  return { activeFrom: { lte: at }, OR: [{ activeTo: null }, { activeTo: { gt: at } }] };
}

export const ProviderBranchAssignmentService = {
  /**
   * Assign a provider user to a provider branch. Validates the full scope chain
   * server-side and rejects an overlapping active duplicate.
   */
  async assign(input: AssignInput, db: Db = prisma) {
    // 1. branch must belong to the same tenant AND provider.
    const branch = await db.providerBranch.findFirst({
      where: { id: input.providerBranchId, tenantId: input.tenantId, providerId: input.providerId },
      select: { id: true },
    });
    if (!branch) {
      throw new ProviderBranchAssignmentError(
        "BRANCH_NOT_IN_SCOPE",
        "Branch does not belong to the given tenant and provider",
      );
    }

    // 2. user must be in the tenant AND bound to this provider (cross-provider denied).
    const user = await db.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId },
      select: { id: true, providerId: true },
    });
    if (!user) {
      throw new ProviderBranchAssignmentError("USER_NOT_IN_TENANT", "User not found in this tenant");
    }
    if (user.providerId !== input.providerId) {
      throw new ProviderBranchAssignmentError(
        "USER_PROVIDER_MISMATCH",
        "User is not bound to this provider — cross-provider assignment denied",
      );
    }

    // 3. no overlapping active duplicate (same tuple already open or future-open).
    const now = new Date();
    const existing = await db.providerUserBranchAssignment.findFirst({
      where: {
        tenantId: input.tenantId,
        providerId: input.providerId,
        userId: input.userId,
        providerBranchId: input.providerBranchId,
        OR: [{ activeTo: null }, { activeTo: { gt: now } }],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ProviderBranchAssignmentError(
        "DUPLICATE_ACTIVE",
        "An active assignment for this user and branch already exists",
      );
    }

    const row = await db.providerUserBranchAssignment.create({
      data: {
        tenantId: input.tenantId,
        providerId: input.providerId,
        userId: input.userId,
        providerBranchId: input.providerBranchId,
        createdBy: input.createdBy,
        activeFrom: input.activeFrom ?? now,
      },
    });

    await writeInlineAudit(db, {
      actorId: input.createdBy,
      tenantId: input.tenantId,
      action: "PROVIDER_BRANCH_ASSIGNMENT_CREATED",
      description: `Provider user assigned to branch`,
      entityId: row.id,
      metadata: { providerId: input.providerId, userId: input.userId, providerBranchId: input.providerBranchId },
    });

    return row;
  },

  /**
   * Soft-retire an assignment (sets activeTo=now + retirement audit facts).
   * Idempotent: an already-retired row is returned unchanged.
   */
  async retire(
    id: string,
    input: { tenantId: string; retiredBy: string; reason?: string },
    db: Db = prisma,
  ) {
    const row = await db.providerUserBranchAssignment.findFirst({
      where: { id, tenantId: input.tenantId },
    });
    if (!row) {
      throw new ProviderBranchAssignmentError("NOT_FOUND", "Assignment not found in this tenant");
    }
    if (row.activeTo && row.activeTo <= new Date()) {
      return row; // already retired — idempotent, no second audit event
    }
    const now = new Date();
    const updated = await db.providerUserBranchAssignment.update({
      where: { id },
      data: { activeTo: now, retiredAt: now, retiredBy: input.retiredBy, retireReason: input.reason ?? null },
    });
    await writeInlineAudit(db, {
      actorId: input.retiredBy,
      tenantId: input.tenantId,
      action: "PROVIDER_BRANCH_ASSIGNMENT_RETIRED",
      description: `Provider user branch assignment retired`,
      entityId: id,
      metadata: { providerId: row.providerId, userId: row.userId, providerBranchId: row.providerBranchId, reason: input.reason ?? null },
    });
    return updated;
  },

  /** Assignments effective for a user at `at` (default now). */
  async activeAssignmentsForUser(userId: string, tenantId: string, at: Date = new Date(), db: Db = prisma) {
    return db.providerUserBranchAssignment.findMany({
      where: { userId, tenantId, ...activeAtFilter(at) },
      orderBy: { activeFrom: "asc" },
    });
  },

  /** Distinct branch ids a user may act within at `at`. Empty ⇒ deny branch-scoped resources (F1.3). */
  async activeBranchIdsForUser(userId: string, tenantId: string, at: Date = new Date(), db: Db = prisma): Promise<string[]> {
    const rows = await ProviderBranchAssignmentService.activeAssignmentsForUser(userId, tenantId, at, db);
    return [...new Set(rows.map((r) => r.providerBranchId))];
  },

  /** All assignments (active + retired) for a user — for admin/audit views. */
  async listAllForUser(userId: string, tenantId: string, db: Db = prisma) {
    return db.providerUserBranchAssignment.findMany({
      where: { userId, tenantId },
      orderBy: [{ activeTo: "asc" }, { activeFrom: "asc" }],
    });
  },
};
