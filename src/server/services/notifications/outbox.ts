import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F4.8 — transactional notification outbox + dispatcher.
 *
 * Producers ENQUEUE a notification intent (ideally in the same tx as their state
 * change — F4.9). A DISPATCHER later drains PENDING rows through a pluggable delivery
 * port:
 *   - IN_APP  → delivered immediately (the row IS the recipient's in-app notice;
 *               read via readAt / listProviderNotifications);
 *   - EMAIL   → handed to deps.deliverEmail; the DEFAULT port is a no-op that marks
 *               the row SKIPPED ("email delivery not provisioned") because the email
 *               worker is unprovisioned — a future worker supplies the port and the
 *               same rows deliver with no schema/producer change.
 *
 * dedupeKey makes enqueue idempotent (unique per tenant when set; NULLs are distinct
 * in PG, so keyless enqueues are never blocked).
 */

type Db = PrismaClient | Prisma.TransactionClient;

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

export type NotificationChannel = "IN_APP" | "EMAIL";

export interface EnqueueNotificationParams {
  tenantId: string;
  channel: NotificationChannel;
  eventType: string;
  title: string;
  body: string;
  providerId?: string;
  userId?: string;
  memberId?: string;
  href?: string;
  priority?: string;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string;
}

export interface OutboxRow {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  userId: string | null;
  memberId: string | null;
  providerId: string | null;
  metadata: unknown;
}

export interface OutboxDeliveryPort {
  /** Deliver an EMAIL row. Absent ⇒ email is not provisioned ⇒ the row is SKIPPED. */
  deliverEmail?: (row: OutboxRow) => Promise<{ delivered: boolean; reason?: string }>;
}

export const NotificationOutboxService = {
  /** Enqueue a PENDING notification. Idempotent when a dedupeKey is supplied. */
  async enqueue(params: EnqueueNotificationParams, db: Db = prisma) {
    try {
      return await db.notificationOutbox.create({
        data: {
          tenantId: params.tenantId,
          providerId: params.providerId ?? null,
          userId: params.userId ?? null,
          memberId: params.memberId ?? null,
          channel: params.channel,
          eventType: params.eventType,
          priority: params.priority ?? "NORMAL",
          title: params.title,
          body: params.body,
          href: params.href ?? null,
          metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          dedupeKey: params.dedupeKey ?? null,
          status: "PENDING",
        },
      });
    } catch (e) {
      if (isUniqueViolation(e) && params.dedupeKey) {
        const existing = await db.notificationOutbox.findFirst({ where: { tenantId: params.tenantId, dedupeKey: params.dedupeKey } });
        if (existing) return existing; // idempotent replay
      }
      throw e;
    }
  },

  /** Drain PENDING rows. Returns a summary; safe to run repeatedly (a sweeper — F4.10). */
  async dispatch(opts: { tenantId?: string; limit?: number } = {}, deps: OutboxDeliveryPort = {}, db: Db = prisma) {
    const pending = await db.notificationOutbox.findMany({
      where: { status: "PENDING", ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      orderBy: { createdAt: "asc" },
      take: opts.limit ?? 100,
    });
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        if (row.channel === "IN_APP") {
          await db.notificationOutbox.update({ where: { id: row.id }, data: { status: "SENT", dispatchedAt: new Date(), attempts: { increment: 1 } } });
          sent++;
        } else if (row.channel === "EMAIL" && deps.deliverEmail) {
          const r = await deps.deliverEmail(row as OutboxRow);
          await db.notificationOutbox.update({
            where: { id: row.id },
            data: r.delivered
              ? { status: "SENT", dispatchedAt: new Date(), attempts: { increment: 1 } }
              : { status: "SKIPPED", failureReason: r.reason ?? "not delivered", attempts: { increment: 1 } },
          });
          r.delivered ? sent++ : skipped++;
        } else {
          // EMAIL without a live port (worker unprovisioned) or an unknown channel.
          await db.notificationOutbox.update({
            where: { id: row.id },
            data: { status: "SKIPPED", failureReason: row.channel === "EMAIL" ? "email delivery not provisioned" : `unknown channel ${row.channel}`, attempts: { increment: 1 } },
          });
          skipped++;
        }
      } catch (e) {
        await db.notificationOutbox
          .update({ where: { id: row.id }, data: { status: "FAILED", failureReason: (e as Error).message, attempts: { increment: 1 } } })
          .catch(() => {});
        failed++;
      }
    }
    return { processed: pending.length, sent, skipped, failed };
  },

  /** A provider's delivered in-app notifications (newest first). */
  async listProviderNotifications(scope: { tenantId: string; providerId: string; unreadOnly?: boolean; limit?: number }, db: Db = prisma) {
    return db.notificationOutbox.findMany({
      where: { tenantId: scope.tenantId, providerId: scope.providerId, channel: "IN_APP", status: "SENT", ...(scope.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: scope.limit ?? 50,
    });
  },

  /** Mark one of the provider's in-app notifications read (scoped — no cross-provider write). */
  async markRead(scope: { tenantId: string; providerId: string; id: string }, db: Db = prisma) {
    const res = await db.notificationOutbox.updateMany({
      where: { id: scope.id, tenantId: scope.tenantId, providerId: scope.providerId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count > 0;
  },
} as const;
