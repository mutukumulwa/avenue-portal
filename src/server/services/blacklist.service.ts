import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { BlacklistReason } from "@prisma/client";
import { rbacService } from "./rbac.service";
import { auditChainService } from "./audit-chain.service";

export const blacklistService = {
  /**
   * Adds a national ID to the internal blacklist.
   * Requires MEMBER:TERMINATE permission.
   */
  async add({
    tenantId,
    nationalId,
    memberName,
    reason,
    narrative,
    addedById,
    relatedMemberId,
  }: {
    tenantId: string;
    nationalId: string;
    memberName: string;
    reason: BlacklistReason;
    narrative?: string;
    addedById: string;
    relatedMemberId?: string;
  }) {
    await rbacService.requirePermission(addedById, "MEMBER:TERMINATE", tenantId);

    const existing = await prisma.internalBlacklist.findFirst({
      where: { tenantId, nationalId, isActive: true },
    });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "National ID is already on the blacklist" });
    }

    const entry = await prisma.internalBlacklist.create({
      data: { tenantId, nationalId, memberName, reason, narrative, addedById, relatedMemberId, isActive: true },
    });

    await auditChainService.append({
      actorId: addedById,
      action: "BLACKLIST:ADDED",
      module: "COMPLIANCE",
      entityType: "InternalBlacklist",
      entityId: entry.id,
      payload: { nationalId, memberName, reason, relatedMemberId },
      tenantId,
      description: `National ID ${nationalId} (${memberName}) added to internal blacklist: ${reason}`,
    });

    return entry;
  },

  /**
   * Checks whether a national ID is on the blacklist.
   * Returns the matching entry or null. Called during submission validation.
   */
  async check(tenantId: string, nationalId: string) {
    return prisma.internalBlacklist.findFirst({
      where: { tenantId, nationalId, isActive: true },
      select: { id: true, memberName: true, reason: true, addedAt: true },
    });
  },

  /**
   * Checks multiple national IDs at once — used during census validation.
   */
  async checkBulk(tenantId: string, nationalIds: string[]) {
    if (nationalIds.length === 0) return [];
    const entries = await prisma.internalBlacklist.findMany({
      where: { tenantId, nationalId: { in: nationalIds }, isActive: true },
      select: { nationalId: true, memberName: true, reason: true },
    });
    return entries;
  },

  /**
   * Deactivates a blacklist entry.
   * Requires an approved OverrideRecord of type RESTORE_TERMINATED_MEMBERSHIP.
   */
  async deactivate({
    tenantId,
    entryId,
    actorId,
    overrideRecordId,
  }: {
    tenantId: string;
    entryId: string;
    actorId: string;
    overrideRecordId: string;
  }) {
    // Verify the override record exists and is approved
    const override = await prisma.overrideRecord.findUnique({ where: { id: overrideRecordId } });
    if (!override || override.tenantId !== tenantId || override.status !== "APPROVED") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "An approved RESTORE_TERMINATED_MEMBERSHIP override record is required",
      });
    }
    if (override.overrideType !== "RESTORE_TERMINATED_MEMBERSHIP") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Override must be of type RESTORE_TERMINATED_MEMBERSHIP",
      });
    }

    const entry = await prisma.internalBlacklist.findUnique({ where: { id: entryId } });
    if (!entry || entry.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Blacklist entry not found" });
    }

    const updated = await prisma.internalBlacklist.update({
      where: { id: entryId },
      data: { isActive: false, deactivatedAt: new Date(), deactivatedById: actorId },
    });

    await auditChainService.append({
      actorId,
      action: "BLACKLIST:REMOVED",
      module: "COMPLIANCE",
      entityType: "InternalBlacklist",
      entityId: entryId,
      payload: { nationalId: entry.nationalId, overrideRecordId },
      tenantId,
      description: `National ID ${entry.nationalId} removed from blacklist (override: ${overrideRecordId})`,
    });

    return updated;
  },

  /**
   * Lists all active blacklist entries for a tenant.
   */
  async list(tenantId: string, opts: { page?: number; pageSize?: number } = {}) {
    const { page = 1, pageSize = 50 } = opts;
    const where = { tenantId, isActive: true };
    const [items, total] = await Promise.all([
      prisma.internalBlacklist.findMany({
        where,
        orderBy: { addedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          addedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.internalBlacklist.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },
};
