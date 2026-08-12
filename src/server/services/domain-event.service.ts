/**
 * UAT-HF P01.03 — transactional domain events and their projection.
 *
 * DEF-040 is the cleanest statement of the problem: "Standard Cancel" terminated a
 * member on one unconfirmed click and computed a refund of UGX 1,196,212.33, and
 * the member's Activity Log still read "No activity recorded yet." The termination
 * and the money were simply absent from the trail. DEF-045, DEF-048, DEF-059 and
 * DEF-081 are the same shape.
 *
 * The cause is structural, not a missing insert: lifecycle writes go to the
 * audit-chain model while the member page reads `ActivityLog`, so the two never
 * meet. Writing `ActivityLog` directly from every command would only move the
 * problem — the next command to forget would fail silently again.
 *
 * So a command records ONE event inside its own transaction:
 *
 *     await prisma.$transaction(async (tx) => {
 *       await tx.member.update(...)                       // state
 *       await OperationReceiptService.succeed(id, {}, tx)  // receipt (P01.02)
 *       await DomainEventService.record({...}, tx)         // event + notifications
 *     })
 *
 * State can therefore never commit without its event. Fan-out to the activity log
 * happens afterwards, in `projectPending`, so a downed SMS/email worker can never
 * roll back a committed business change — and a failed projection stays visible
 * and replayable instead of being lost.
 */
import { Prisma, type DomainEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  NotificationOutboxService,
  type EnqueueNotificationParams,
} from "@/server/services/notifications/outbox";

type Db = Prisma.TransactionClient | typeof prisma;

/** After this many failed attempts a projection stops retrying and asks for help. */
export const MAX_PROJECTION_ATTEMPTS = 5;

export interface RecordEventInput {
  tenantId: string;
  /** Dotted, stable name, e.g. "member.lifecycle.terminated". */
  eventType: string;
  /** Uppercase entity name, matching ActivityLog's vocabulary: MEMBER, GROUP, … */
  entityType: string;
  entityId: string;
  entityRef?: string;
  /** One human sentence — this is what the activity log shows. */
  description: string;
  actor?: { id?: string; name?: string; role?: string };
  /** When the change took business effect, if not now. */
  occurredAt?: Date;
  payload: Prisma.InputJsonValue;
  reasonCode?: string;
  reasonNote?: string;
  correlationId?: string;
  operationReceiptId?: string;
  /**
   * Notifications to enqueue in the SAME transaction. Delivery still happens
   * later via the existing dispatcher; only the *intent* is transactional, which
   * is what stops a dead mail worker from rolling back a termination.
   */
  notifications?: Omit<EnqueueNotificationParams, "tenantId" | "dedupeKey">[];
}

export interface ProjectionSummary {
  examined: number;
  projected: number;
  alreadyProjected: number;
  failed: number;
}

/**
 * Which ActivityLog polymorphic column to populate. ActivityLog has real foreign
 * keys for these, so setting the wrong one would fail the write.
 */
export function polymorphicLink(entityType: string, entityId: string): Record<string, string> {
  switch (entityType.toUpperCase()) {
    case "MEMBER":
      return { memberId: entityId };
    case "GROUP":
      return { groupId: entityId };
    case "ENDORSEMENT":
      return { endorsementId: entityId };
    case "PREAUTH":
    case "PREAUTHORIZATION":
      return { preauthId: entityId };
    default:
      // Still recorded, just without a typed link — entityType/entityId carry it.
      return {};
  }
}

/** "member.lifecycle.terminated" → "TERMINATED"; falls back to the whole name. */
export function actionFromEventType(eventType: string): string {
  const last = eventType.split(".").filter(Boolean).pop();
  return (last ?? eventType).toUpperCase();
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

export const DomainEventService = {
  MAX_PROJECTION_ATTEMPTS,

  /**
   * Record what happened. Pass the SAME transaction client as the state change —
   * that coupling is the whole point.
   */
  async record(input: RecordEventInput, db: Db = prisma): Promise<DomainEvent> {
    const event = await db.domainEvent.create({
      data: {
        tenantId: input.tenantId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        entityRef: input.entityRef,
        description: input.description,
        actorId: input.actor?.id,
        actorName: input.actor?.name,
        actorRole: input.actor?.role,
        occurredAt: input.occurredAt ?? new Date(),
        payload: input.payload,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        correlationId: input.correlationId,
        operationReceiptId: input.operationReceiptId,
      },
    });

    // Enqueue delivery intents in the same transaction, keyed off the event so a
    // retried command cannot enqueue the same notice twice.
    for (const [index, notification] of (input.notifications ?? []).entries()) {
      await NotificationOutboxService.enqueue(
        {
          ...notification,
          tenantId: input.tenantId,
          dedupeKey: `evt:${event.id}:${index}`,
        },
        db,
      );
    }

    return event;
  },

  /**
   * Fan PENDING events out into the activity log.
   *
   * Idempotent by construction: `ActivityLog.domainEventId` is unique, so a
   * projector that crashed after inserting but before marking the event cannot
   * create a second activity line on restart.
   */
  async projectPending(options: { limit?: number; tenantId?: string } = {}): Promise<ProjectionSummary> {
    const events = await prisma.domainEvent.findMany({
      where: {
        projectionState: "PENDING",
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 100,
    });

    const summary: ProjectionSummary = {
      examined: events.length,
      projected: 0,
      alreadyProjected: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        let already = false;
        try {
          await prisma.activityLog.create({
            data: {
              domainEventId: event.id,
              entityType: event.entityType,
              entityId: event.entityId,
              action: actionFromEventType(event.eventType),
              description: event.description,
              userId: event.actorId,
              metadata: {
                eventType: event.eventType,
                entityRef: event.entityRef,
                actorName: event.actorName,
                actorRole: event.actorRole,
                reasonCode: event.reasonCode,
                reasonNote: event.reasonNote,
                correlationId: event.correlationId,
                occurredAt: event.occurredAt.toISOString(),
              },
              ...polymorphicLink(event.entityType, event.entityId),
            },
          });
        } catch (err) {
          // The activity line already exists from an earlier, interrupted run.
          if (!isUniqueViolation(err)) throw err;
          already = true;
        }

        await prisma.domainEvent.update({
          where: { id: event.id },
          data: { projectionState: "PROJECTED", projectedAt: new Date(), projectionError: null },
        });

        if (already) summary.alreadyProjected += 1;
        else summary.projected += 1;
      } catch (err) {
        const attempts = event.projectionAttempts + 1;
        await prisma.domainEvent.update({
          where: { id: event.id },
          data: {
            projectionAttempts: attempts,
            // Never silently drop: after the cap it becomes FAILED and visible.
            projectionState: attempts >= MAX_PROJECTION_ATTEMPTS ? "FAILED" : "PENDING",
            projectionError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          },
        });
        summary.failed += 1;
      }
    }

    return summary;
  },

  /** Events whose fan-out has not completed — the operational backlog (P12.01). */
  async listUnprojected(params: { tenantId?: string; limit?: number } = {}): Promise<DomainEvent[]> {
    return prisma.domainEvent.findMany({
      where: {
        projectionState: { in: ["PENDING", "FAILED"] },
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: params.limit ?? 100,
    });
  },

  /** Put FAILED events back in the queue after the cause has been fixed. */
  async replayFailed(params: { tenantId?: string; eventIds?: string[] } = {}): Promise<number> {
    const result = await prisma.domainEvent.updateMany({
      where: {
        projectionState: "FAILED",
        ...(params.tenantId ? { tenantId: params.tenantId } : {}),
        ...(params.eventIds ? { id: { in: params.eventIds } } : {}),
      },
      data: { projectionState: "PENDING", projectionAttempts: 0, projectionError: null },
    });
    return result.count;
  },
};
