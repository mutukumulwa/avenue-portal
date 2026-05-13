import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { OverrideType, OverrideReasonCode } from "@prisma/client";
import { rbacService } from "./rbac.service";
import { auditChainService } from "./audit-chain.service";

// ─── SLA DURATIONS ───────────────────────────────────────────────────────────

// Operational overrides: 2 hours. Commercial: 24 hours.
const OPERATIONAL_OVERRIDE_TYPES = new Set<OverrideType>([
  "BACK_DATED_AMENDMENT",
  "BACK_DATED_COVER_START",
  "PRE_AUTH_OVER_BENEFIT_CAP",
  "CLAIM_EXCLUDED_DIAGNOSIS",
  "FORCE_APPROVE_FRAUD_CLAIM",
  "WAIVE_CO_CONTRIBUTION",
  "EXTEND_GRACE_PERIOD",
  "FRAUD_RULE_THRESHOLD_ADJUSTMENT",
  "RESTORE_TERMINATED_MEMBERSHIP",
  "PRIVILEGE_ESCALATION",
]);

function slaDeadlineAt(overrideType: OverrideType): Date {
  const hoursAhead = OPERATIONAL_OVERRIDE_TYPES.has(overrideType) ? 2 : 24;
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
}

// ─── APPROVER ROUTING ────────────────────────────────────────────────────────
// Maps each override type to required approver role(s).
// Dual-approval types list two roles; both must approve.

export const OVERRIDE_APPROVER_ROLES: Record<OverrideType, string[]> = {
  BACK_DATED_AMENDMENT:              ["SENIOR_UNDERWRITER"],
  BACK_DATED_COVER_START:            ["SENIOR_UNDERWRITER"],
  RATE_DEVIATION_EXCEED:             ["SENIOR_UNDERWRITER"],
  PRE_AUTH_OVER_BENEFIT_CAP:         ["SENIOR_CLAIMS_OFFICER", "COMPLIANCE_OFFICER"],
  CLAIM_EXCLUDED_DIAGNOSIS:          ["SENIOR_CLAIMS_OFFICER"],
  FORCE_APPROVE_FRAUD_CLAIM:         ["SENIOR_CLAIMS_OFFICER", "COMPLIANCE_OFFICER"],
  WAIVE_CO_CONTRIBUTION:             ["SENIOR_CLAIMS_OFFICER"],
  EXTEND_GRACE_PERIOD:               ["SENIOR_UNDERWRITER"],
  MID_TERM_RATE_CHANGE:              ["SENIOR_UNDERWRITER", "SCHEME_MANAGER"],
  FRAUD_RULE_THRESHOLD_ADJUSTMENT:   ["COMPLIANCE_OFFICER"],
  RESTORE_TERMINATED_MEMBERSHIP:     ["SENIOR_UNDERWRITER", "COMPLIANCE_OFFICER"],
  PRIVILEGE_ESCALATION:              ["SENIOR_UNDERWRITER"],
  CUSTOM:                            ["SENIOR_UNDERWRITER"],
};

// ─── OVERRIDE SERVICE ─────────────────────────────────────────────────────────

export const overrideService = {
  /**
   * Request an override (maker step).
   * Captures the pre-state of the affected entity and creates the record.
   */
  async request({
    tenantId,
    makerId,
    overrideType,
    entityType,
    entityId,
    reasonCode,
    justification,
    preState,
  }: {
    tenantId: string;
    makerId: string;
    overrideType: OverrideType;
    entityType: string;
    entityId: string;
    reasonCode: OverrideReasonCode;
    justification: string;
    preState?: Record<string, unknown>;
  }) {
    await rbacService.requirePermission(makerId, "OVERRIDE:REQUEST", tenantId);

    const record = await prisma.overrideRecord.create({
      data: {
        tenantId,
        overrideType,
        makerId,
        reasonCode,
        justification,
        entityType,
        entityId,
        preState: (preState ?? {}) as never,
        status: "PENDING",
        slaDeadlineAt: slaDeadlineAt(overrideType),
      },
    });

    await auditChainService.append({
      actorId: makerId,
      action: "OVERRIDE:REQUESTED",
      module: "OVERRIDE",
      entityType: "OverrideRecord",
      entityId: record.id,
      payload: { overrideType, entityType, entityId, reasonCode, justification },
      tenantId,
      description: `Override requested: ${overrideType} on ${entityType}:${entityId}`,
    });

    return record;
  },

  /**
   * Approve an override (checker step).
   * Enforces checker ≠ maker and that checker holds a required approver role.
   * Caller is responsible for applying the underlying business action after approval.
   */
  async approve({
    overrideId,
    checkerId,
    tenantId,
    postState,
    notes,
  }: {
    overrideId: string;
    checkerId: string;
    tenantId: string;
    postState?: Record<string, unknown>;
    notes?: string;
  }) {
    const record = await prisma.overrideRecord.findUnique({ where: { id: overrideId } });
    if (!record || record.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Override record not found" });
    }
    if (record.status !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Override is not pending" });
    }
    if (record.makerId === checkerId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Maker and checker must be different users",
      });
    }

    // Verify checker holds at least one of the required approver roles
    const requiredRoles = OVERRIDE_APPROVER_ROLES[record.overrideType];
    let checkerHasRole = false;
    for (const role of requiredRoles) {
      if (await rbacService.hasRole(checkerId, role, tenantId)) {
        checkerHasRole = true;
        break;
      }
    }
    // SUPER_ADMIN can approve any override
    if (!checkerHasRole) {
      checkerHasRole = await rbacService.hasRole(checkerId, "SUPER_ADMIN", tenantId);
    }
    if (!checkerHasRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Approver must hold one of: ${requiredRoles.join(", ")}`,
      });
    }

    const isDualApproval = requiredRoles.length > 1;
    const isFirstChecker = !record.checkerId;
    const justificationNote = notes
      ? record.justification + `\n\nApprover note: ${notes}`
      : undefined;

    let updated;
    if (isDualApproval && isFirstChecker) {
      // First of two required approvers — still pending
      updated = await prisma.overrideRecord.update({
        where: { id: overrideId },
        data: {
          checkerId,
          status: "PENDING",
          ...(justificationNote ? { justification: justificationNote } : {}),
        },
      });
    } else {
      // Final approval (single-approver, or second approver of dual-approval)
      updated = await prisma.overrideRecord.update({
        where: { id: overrideId },
        data: {
          checkerId: record.checkerId ?? checkerId,
          ...(isDualApproval ? { checker2Id: checkerId } : {}),
          status: "APPROVED",
          resolvedAt: new Date(),
          // Cast: our payload is always a valid JSON object at runtime
          postState: (postState ?? {}) as never,
          ...(justificationNote ? { justification: justificationNote } : {}),
        },
      });
    }

    if (updated.status === "APPROVED") {
      await auditChainService.append({
        actorId: checkerId,
        action: "OVERRIDE:APPROVED",
        module: "OVERRIDE",
        entityType: "OverrideRecord",
        entityId: overrideId,
        payload: { overrideType: record.overrideType, entityType: record.entityType, entityId: record.entityId, makerId: record.makerId, checkerId },
        tenantId,
        description: `Override approved: ${record.overrideType} on ${record.entityType}:${record.entityId}`,
      });
    }

    return updated;
  },

  /**
   * Reject an override.
   */
  async reject({
    overrideId,
    checkerId,
    tenantId,
    reason,
  }: {
    overrideId: string;
    checkerId: string;
    tenantId: string;
    reason: string;
  }) {
    const record = await prisma.overrideRecord.findUnique({ where: { id: overrideId } });
    if (!record || record.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Override record not found" });
    }
    if (record.status !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Override is not pending" });
    }
    if (record.makerId === checkerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Maker and checker must be different users" });
    }

    const updated = await prisma.overrideRecord.update({
      where: { id: overrideId },
      data: {
        status: "REJECTED",
        checkerId,
        resolvedAt: new Date(),
        justification: record.justification + `\n\nRejection reason: ${reason}`,
      },
    });

    await auditChainService.append({
      actorId: checkerId,
      action: "OVERRIDE:REJECTED",
      module: "OVERRIDE",
      entityType: "OverrideRecord",
      entityId: overrideId,
      payload: { overrideType: record.overrideType, makerId: record.makerId, checkerId, reason },
      tenantId,
      description: `Override rejected: ${record.overrideType} on ${record.entityType}:${record.entityId}`,
    });

    return updated;
  },

  /**
   * Lists override records for a tenant, paginated and filterable.
   */
  async list(
    tenantId: string,
    opts: {
      status?: string;
      overrideType?: OverrideType;
      makerId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
      tenantId,
      ...(opts.status ? { status: opts.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" } : {}),
      ...(opts.overrideType ? { overrideType: opts.overrideType } : {}),
      ...(opts.makerId ? { makerId: opts.makerId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.overrideRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          maker: { select: { id: true, firstName: true, lastName: true, email: true } },
          checker: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.overrideRecord.count({ where }),
    ]);

    return { items, total, page, pageSize };
  },

  /**
   * Returns per-maker override frequency data for compliance review.
   * Surfaces patterns that may indicate abuse.
   */
  async getPatterns(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date } = {},
  ) {
    const where = {
      tenantId,
      ...(opts.fromDate || opts.toDate
        ? { createdAt: { ...(opts.fromDate ? { gte: opts.fromDate } : {}), ...(opts.toDate ? { lte: opts.toDate } : {}) } }
        : {}),
    };

    const records = await prisma.overrideRecord.findMany({
      where,
      select: {
        makerId: true,
        overrideType: true,
        status: true,
        maker: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // Aggregate by maker
    const byMaker: Record<string, {
      makerId: string;
      makerName: string;
      total: number;
      approved: number;
      rejected: number;
      byType: Record<string, number>;
    }> = {};

    for (const r of records) {
      if (!byMaker[r.makerId]) {
        byMaker[r.makerId] = {
          makerId: r.makerId,
          makerName: `${r.maker.firstName} ${r.maker.lastName}`,
          total: 0,
          approved: 0,
          rejected: 0,
          byType: {},
        };
      }
      byMaker[r.makerId].total++;
      if (r.status === "APPROVED") byMaker[r.makerId].approved++;
      if (r.status === "REJECTED") byMaker[r.makerId].rejected++;
      byMaker[r.makerId].byType[r.overrideType] =
        (byMaker[r.makerId].byType[r.overrideType] ?? 0) + 1;
    }

    return Object.values(byMaker).sort((a, b) => b.total - a.total);
  },

  /**
   * Generates a structured daily override summary for the compliance inbox.
   * Returns a plain-text / structured JSON summary; caller renders/delivers it.
   */
  async generateDailySummary(tenantId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [pending, approvedToday, rejectedToday, slaBreached] = await Promise.all([
      prisma.overrideRecord.count({ where: { tenantId, status: "PENDING" } }),
      prisma.overrideRecord.count({ where: { tenantId, status: "APPROVED", resolvedAt: { gte: since } } }),
      prisma.overrideRecord.count({ where: { tenantId, status: "REJECTED", resolvedAt: { gte: since } } }),
      prisma.overrideRecord.count({ where: { tenantId, status: "PENDING", slaDeadlineAt: { lt: new Date() } } }),
    ]);

    const recentByType = await prisma.overrideRecord.groupBy({
      by: ["overrideType"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
    });

    return {
      date:          new Date().toISOString().split("T")[0],
      pending,
      approvedToday,
      rejectedToday,
      slaBreached,
      byType:        recentByType.map((r) => ({ type: r.overrideType, count: r._count._all })),
      generatedAt:   new Date().toISOString(),
    };
  },

  /**
   * Generates a monthly override aggregate report.
   * Returns structured data; the job/route renders it as PDF via Puppeteer.
   */
  async generateMonthlyReport(tenantId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0, 23, 59, 59);

    const records = await prisma.overrideRecord.findMany({
      where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      include: {
        maker:   { select: { firstName: true, lastName: true, email: true } },
        checker: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalRequested = records.length;
    const totalApproved  = records.filter((r) => r.status === "APPROVED").length;
    const totalRejected  = records.filter((r) => r.status === "REJECTED").length;
    const avgResolutionHrs = records
      .filter((r) => r.resolvedAt && r.createdAt)
      .map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000))
      .reduce((s, v, _, a) => s + v / a.length, 0);

    // Group by type
    const byType: Record<string, number> = {};
    for (const r of records) {
      byType[r.overrideType] = (byType[r.overrideType] ?? 0) + 1;
    }

    // Top requesters
    const byMaker: Record<string, { name: string; count: number }> = {};
    for (const r of records) {
      if (!byMaker[r.makerId]) {
        byMaker[r.makerId] = {
          name:  `${r.maker.firstName} ${r.maker.lastName}`,
          count: 0,
        };
      }
      byMaker[r.makerId].count++;
    }
    const topRequesters = Object.values(byMaker).sort((a, b) => b.count - a.count).slice(0, 10);

    return {
      period:          `${year}-${String(month).padStart(2, "0")}`,
      totalRequested,
      totalApproved,
      totalRejected,
      approvalRate:    totalRequested > 0 ? (totalApproved / totalRequested) : 0,
      avgResolutionHrs: Math.round(avgResolutionHrs * 10) / 10,
      byType,
      topRequesters,
      records:         records.map((r) => ({
        id:           r.id,
        type:         r.overrideType,
        reasonCode:   r.reasonCode,
        status:       r.status,
        maker:        `${r.maker.firstName} ${r.maker.lastName}`,
        checker:      r.checker ? `${r.checker.firstName} ${r.checker.lastName}` : "—",
        createdAt:    r.createdAt.toISOString(),
        resolvedAt:   r.resolvedAt?.toISOString() ?? null,
      })),
    };
  },

  /**
   * Marks PENDING overrides past their SLA deadline as EXPIRED.
   * Called by the job on each run.
   */
  async expireSlaBreached(tenantId: string): Promise<number> {
    const { count } = await prisma.overrideRecord.updateMany({
      where: { tenantId, status: "PENDING", slaDeadlineAt: { lt: new Date() } },
      data:  { status: "EXPIRED" },
    });
    return count;
  },
};
