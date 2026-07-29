import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertSafeEventMetadata } from "@/server/services/preauth-intake/events";

/**
 * PNOS F5.14 — reconsideration lifecycle event helpers.
 *
 * Events are append-only with an explicit per-case `sequence`, mirroring the PA event log
 * (F3.2). The unique (reconsiderationId, sequence) makes a concurrent double-append fail
 * loudly rather than silently reorder history. `message` carries provider-SAFE exchange text
 * (the structured info-request / provider-response only — the provider timeline gates it,
 * F5.11/F5.14); internal detail is referenced by `internalReasonRef` — never inlined. Metadata
 * is validated SAFE (ids/codes/short labels) by the shared PA guard.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const RECONSIDERATION_EVENT_TYPES = [
  "SUBMITTED",
  "TRIAGED",
  "ASSIGNED",
  "INFO_REQUESTED",
  "PROVIDER_RESPONDED",
  "UNDER_REVIEW",
  "INTERNAL_NOTE",
  "OUTCOME_RECORDED",
  "ACCEPTED",
  "PARTIALLY_ACCEPTED",
  "UPHELD",
  "WITHDRAWN",
  "CLOSED",
] as const;
export type ReconsiderationEventType = (typeof RECONSIDERATION_EVENT_TYPES)[number];

export interface AppendReconsiderationEventInput {
  tenantId: string;
  reconsiderationId: string;
  eventType: ReconsiderationEventType;
  priorStatus?: string | null;
  newStatus?: string | null;
  safeReasonCode?: string | null;
  /** POINTER to internal detail (never the detail itself, §9). */
  internalReasonRef?: string | null;
  /** Human-readable text; provider-facing ONLY for the info exchange types (timeline-gated). */
  message?: string | null;
  actorType: string;
  actorId?: string | null;
  dataVersionRef?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

/** Append the next event for a reconsideration case. Sequence = current max + 1. */
export async function appendReconsiderationEvent(input: AppendReconsiderationEventInput, db: Db = prisma) {
  assertSafeEventMetadata(input.metadata ?? null);
  const last = await db.claimReconsiderationEvent.findFirst({
    where: { reconsiderationId: input.reconsiderationId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;
  return db.claimReconsiderationEvent.create({
    data: {
      tenantId: input.tenantId,
      reconsiderationId: input.reconsiderationId,
      sequence,
      eventType: input.eventType,
      priorStatus: input.priorStatus ?? null,
      newStatus: input.newStatus ?? null,
      safeReasonCode: input.safeReasonCode ?? null,
      internalReasonRef: input.internalReasonRef ?? null,
      message: input.message ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      dataVersionRef: input.dataVersionRef ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Ordered timeline for a case (append order). */
export async function listReconsiderationEvents(reconsiderationId: string, db: Db = prisma) {
  return db.claimReconsiderationEvent.findMany({ where: { reconsiderationId }, orderBy: { sequence: "asc" } });
}
