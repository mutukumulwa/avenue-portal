import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { NotificationOutboxService } from "../notifications/outbox";

/**
 * PNOS F4.10 — information-request SLA sweeper + operational queues.
 *
 * sweepOverdueInfoRequests is an idempotent batch job (a cron/worker or an operator
 * runs it): it finds requests still AWAITING THE PROVIDER (OPEN/REOPENED) whose dueAt
 * has passed and enqueues a HIGH provider reminder through the F4.8 outbox — deduped
 * per request per calendar day (dedupeKey), so repeated sweeps never spam. It creates
 * no PA event (the timeline stays lifecycle-only) and mutates no info request (state
 * stays with the human transitions). overdueInfoRequests is the matching operational
 * queue read (scoped like the F3.7 read model). The notification-DELIVERY sweeper is
 * NotificationOutboxService.dispatch (F4.8), invoked on the same schedule.
 */

type Db = PrismaClient | Prisma.TransactionClient;

const AWAITING_PROVIDER = ["OPEN", "REOPENED"];

export const PreauthInfoRequestSweeper = {
  /** Enqueue a deduped overdue reminder for every awaiting-provider request past due. */
  async sweepOverdueInfoRequests(opts: { tenantId?: string; now?: Date; limit?: number } = {}, db: Db = prisma) {
    const now = opts.now ?? new Date();
    const overdue = await db.preauthInfoRequest.findMany({
      where: { status: { in: AWAITING_PROVIDER as never }, dueAt: { lt: now }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      orderBy: { dueAt: "asc" },
      take: opts.limit ?? 500,
    });
    const day = now.toISOString().slice(0, 10);
    for (const r of overdue) {
      await NotificationOutboxService.enqueue(
        {
          tenantId: r.tenantId,
          providerId: r.providerId,
          channel: "IN_APP",
          eventType: "INFO_REQUEST_OVERDUE",
          priority: "HIGH",
          title: "Overdue: information request",
          body: "A pre-authorization information request is overdue. Please respond as soon as possible.",
          href: `/provider/inbox/${r.id}`,
          metadata: { infoRequestId: r.id, preauthId: r.preAuthorizationId },
          dedupeKey: `INFO_OVERDUE:${r.id}:${day}`, // one reminder per request per day
        },
        db,
      );
    }
    return { overdue: overdue.length };
  },

  /** Operational queue: awaiting-provider requests that are past due (scoped). */
  async overdueInfoRequests(
    scope: { tenantId: string; providerId?: string; clientId?: string | null; now?: Date; limit?: number },
    db: Db = prisma,
  ) {
    const now = scope.now ?? new Date();
    return db.preauthInfoRequest.findMany({
      where: {
        tenantId: scope.tenantId,
        status: { in: AWAITING_PROVIDER as never },
        dueAt: { lt: now },
        ...(scope.providerId ? { providerId: scope.providerId } : {}),
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: scope.limit ?? 200,
    });
  },
} as const;
