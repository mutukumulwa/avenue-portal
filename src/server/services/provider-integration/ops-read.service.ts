import { prisma } from "@/lib/prisma";
import type { IntegrationDeliveryStatus } from "@prisma/client";
import {
  ProviderAccessService,
  type ProviderAccessContext,
} from "@/server/services/provider-access.service";

/**
 * PNOS F9.8 — scoped, safe READ models for the integration operations views.
 *
 * Every read is permission-gated (provider.integrations.manage), provider- and
 * branch-scoped (server-derived), non-enumerating (a foreign delivery is a safe
 * not-found), and bounded (pagination). The projections EXCLUDE every raw payload,
 * hash-of-body detail beyond an integrity marker, secret, credential, and header —
 * only status/counts/timestamps/safe error codes/next-action reach the view.
 *
 * Read-only: no domain data is edited here (F9.8 stop). Connection lifecycle
 * actions reuse the F9.3 admin service; delivery re-drive reuses the F9.6 manual
 * retry — both permission-gated at the action layer.
 */

const PERMISSION = "provider.integrations.manage";
const MAX_PAGE = 100;

type Db = typeof prisma;

export interface ConnectionHealthView {
  id: string;
  label: string;
  connectorType: string;
  mode: string;
  status: string;
  circuitState: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  deliveries: { total: number; accepted: number; retrying: number; quarantined: number; completed: number; partial: number; rejected: number; retryDue: number };
}

export interface DeliveryListItem {
  id: string;
  businessObjectType: string;
  direction: string;
  status: string;
  externalBatchRef: string | null;
  recordCount: number | null;
  appliedCount: number;
  rejectedCount: number;
  quarantinedCount: number;
  attemptCount: number;
  receivedAt: Date;
  completedAt: Date | null;
  nextAttemptAt: Date | null;
  nextAction: string;
}

export interface DeliveryDetailView extends DeliveryListItem {
  connectionId: string;
  amountTotal: string | null;
  quarantineReason: string | null;
  attempts: Array<{ attemptNumber: number; startedAt: Date; endedAt: Date | null; resultClass: string | null; httpStatus: number | null; safeErrorCode: string | null; retryable: boolean; nextAttemptAt: Date | null }>;
  records: Array<{ recordIndex: number; outcome: string; canonicalEntityType: string | null; canonicalEntityId: string | null; canonicalReceiptRef: string | null; amount: string | null; safeReason: string | null }>;
  reconciliation: { records: number | null; applied: number; rejected: number; quarantined: number; replayed: number };
}

function nextAction(status: string): string {
  switch (status) {
    case "RETRYING": return "retry-due — will re-attempt on schedule";
    case "QUARANTINED": return "remediate then manual-retry";
    case "PARTIAL": return "review quarantined/rejected records";
    case "ACCEPTED": return "queued for processing";
    case "REJECTED": return "rejected — no action";
    default: return "none";
  }
}

/** Provider (+ optional branch) scope fragment, server-derived. Branch-restricted actors see only their branches' deliveries. */
function scopeWhere(ctx: ProviderAccessContext) {
  // An actor with no branch restriction (empty set) sees all provider-level + any-branch rows;
  // a branch-restricted actor sees provider-level ("") + their authorized branches only.
  if (ctx.allowedProviderBranchIds.length === 0) {
    return { tenantId: ctx.tenantId, providerId: ctx.providerId };
  }
  return { tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: { in: ["", ...ctx.allowedProviderBranchIds] } };
}

export const ProviderIntegrationOpsRead = {
  async listConnectionHealth(ctx: ProviderAccessContext, db: Db = prisma): Promise<ConnectionHealthView[]> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const conns = await db.providerIntegrationConnection.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: { id: true, providerBranchId: true, label: true, connectorType: true, mode: true, status: true, circuitState: true, lastSuccessAt: true, lastFailureAt: true },
      orderBy: { createdAt: "desc" },
    });
    const visible = conns.filter((c) => !c.providerBranchId || ProviderAccessService.hasBranch(ctx, c.providerBranchId));
    const now = new Date();
    return Promise.all(
      visible.map(async (c) => {
        const grouped = await db.providerIntegrationDelivery.groupBy({ by: ["status"], where: { connectionId: c.id }, _count: { _all: true } });
        const by = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
        const retryDue = await db.providerIntegrationDelivery.count({ where: { connectionId: c.id, status: "RETRYING", nextAttemptAt: { lte: now } } });
        return {
          id: c.id, label: c.label, connectorType: c.connectorType, mode: c.mode, status: c.status, circuitState: c.circuitState,
          lastSuccessAt: c.lastSuccessAt, lastFailureAt: c.lastFailureAt,
          deliveries: { total: grouped.reduce((n, g) => n + g._count._all, 0), accepted: by("ACCEPTED"), retrying: by("RETRYING"), quarantined: by("QUARANTINED"), completed: by("COMPLETED"), partial: by("PARTIAL"), rejected: by("REJECTED"), retryDue },
        };
      }),
    );
  },

  /** Paginated delivery list (bounded), newest first. cursor = the last delivery id from the prior page. */
  async listDeliveries(ctx: ProviderAccessContext, filters: { connectionId?: string; status?: IntegrationDeliveryStatus; take?: number; cursor?: string } = {}, db: Db = prisma): Promise<{ items: DeliveryListItem[]; nextCursor: string | null }> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const take = Math.min(Math.max(1, filters.take ?? 25), MAX_PAGE);
    const rows = await db.providerIntegrationDelivery.findMany({
      where: {
        ...scopeWhere(ctx),
        ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      select: {
        id: true, businessObjectType: true, direction: true, status: true, externalBatchRef: true, recordCount: true,
        appliedCount: true, rejectedCount: true, quarantinedCount: true, attemptCount: true, receivedAt: true, completedAt: true, nextAttemptAt: true,
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: take + 1, // fetch one extra to compute the next cursor
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((r) => ({ ...r, nextAction: nextAction(r.status) })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  /** Non-enumerating scoped detail: a foreign/branch-mismatched delivery returns null. */
  async getDeliveryDetail(ctx: ProviderAccessContext, deliveryId: string, db: Db = prisma): Promise<DeliveryDetailView | null> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const d = await db.providerIntegrationDelivery.findFirst({
      where: { id: deliveryId, tenantId: ctx.tenantId },
      select: {
        id: true, connectionId: true, providerId: true, providerBranchId: true, businessObjectType: true, direction: true, status: true,
        externalBatchRef: true, recordCount: true, amountTotal: true, appliedCount: true, rejectedCount: true, quarantinedCount: true, replayedCount: true,
        attemptCount: true, receivedAt: true, completedAt: true, nextAttemptAt: true, quarantineReason: true,
      },
    });
    if (!d || d.providerId !== ctx.providerId) return null;
    if (d.providerBranchId && !ProviderAccessService.hasBranch(ctx, d.providerBranchId)) return null;

    const [attempts, records] = await Promise.all([
      db.providerIntegrationAttempt.findMany({ where: { deliveryId: d.id }, orderBy: { attemptNumber: "asc" }, select: { attemptNumber: true, startedAt: true, endedAt: true, resultClass: true, httpStatus: true, safeErrorCode: true, retryable: true, nextAttemptAt: true } }),
      db.providerIntegrationRecordResult.findMany({ where: { deliveryId: d.id }, orderBy: { recordIndex: "asc" }, select: { recordIndex: true, outcome: true, canonicalEntityType: true, canonicalEntityId: true, canonicalReceiptRef: true, amount: true, safeReason: true } }),
    ]);

    return {
      id: d.id, connectionId: d.connectionId, businessObjectType: d.businessObjectType, direction: d.direction, status: d.status,
      externalBatchRef: d.externalBatchRef, recordCount: d.recordCount, appliedCount: d.appliedCount, rejectedCount: d.rejectedCount, quarantinedCount: d.quarantinedCount,
      attemptCount: d.attemptCount, receivedAt: d.receivedAt, completedAt: d.completedAt, nextAttemptAt: d.nextAttemptAt, nextAction: nextAction(d.status),
      amountTotal: d.amountTotal ? d.amountTotal.toString() : null, quarantineReason: d.quarantineReason,
      attempts,
      records: records.map((r) => ({ ...r, amount: r.amount ? r.amount.toString() : null })),
      reconciliation: { records: d.recordCount, applied: d.appliedCount, rejected: d.rejectedCount, quarantined: d.quarantinedCount, replayed: d.replayedCount },
    };
  },
} as const;
