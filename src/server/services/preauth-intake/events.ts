import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F3.2 — PA lifecycle event helpers.
 *
 * Events are append-only with an explicit per-PA `sequence`. Metadata must be
 * SAFE (ids, codes, short labels): a clinical body, document content, free-text
 * notes, or a raw payload must never be inlined — reference it with
 * `internalReasonRef` instead (§7.5, §9.8).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const PREAUTH_EVENT_TYPES = [
  "SUBMITTED", "ASSIGNED", "INFO_REQUESTED", "INFO_REQUEST_CANCELLED", "RESPONSE_SUBMITTED", "RESPONSE_ACCEPTED",
  "APPROVED", "PARTIALLY_APPROVED", "DECLINED", "CANCELLED", "AMENDED",
  "GOP_ISSUED", "HOLD_CREATED", "HOLD_RELEASED", "CONVERTED_TO_CLAIM",
] as const;
export type PreauthEventType = (typeof PREAUTH_EVENT_TYPES)[number];

/** Keys that would carry clinical/free-text/raw content into event metadata. */
const FORBIDDEN_METADATA_KEYS = [
  "notes", "clinicalnotes", "note", "body", "payload", "content", "document",
  "attachment", "file", "diagnosistext", "description", "rawrequest", "response",
];
const MAX_METADATA_VALUE_LENGTH = 200;

export class UnsafeEventMetadataError extends Error {
  constructor(public reason: string) {
    super(`Unsafe PA event metadata: ${reason}`);
    this.name = "UnsafeEventMetadataError";
  }
}

/**
 * Reject metadata that carries clinical/raw content. Allows ids, codes, counts,
 * booleans and SHORT labels only.
 */
export function assertSafeEventMetadata(metadata: unknown): void {
  if (metadata === null || metadata === undefined) return;
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new UnsafeEventMetadataError("metadata must be a flat object");
  }
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEYS.includes(key.toLowerCase())) {
      throw new UnsafeEventMetadataError(`key "${key}" may carry clinical or raw content`);
    }
    if (value === null || typeof value === "number" || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (value.length > MAX_METADATA_VALUE_LENGTH) {
        throw new UnsafeEventMetadataError(`value for "${key}" is too long to be a safe label`);
      }
      continue;
    }
    throw new UnsafeEventMetadataError(`value for "${key}" must be a string, number, boolean or null`);
  }
}

export interface AppendPreauthEventInput {
  tenantId: string;
  preAuthorizationId: string;
  eventType: PreauthEventType;
  priorStatus?: string | null;
  newStatus?: string | null;
  safeReasonCode?: string | null;
  internalReasonRef?: string | null;
  actorType: string;
  actorId?: string | null;
  dataVersionRef?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

/**
 * Append the next event for a PA. Sequence is derived from the current max, and
 * the unique (preAuthorizationId, sequence) makes a concurrent double-append
 * fail loudly rather than silently reorder history.
 */
export async function appendPreauthEvent(input: AppendPreauthEventInput, db: Db = prisma) {
  assertSafeEventMetadata(input.metadata ?? null);
  const last = await db.preAuthorizationEvent.findFirst({
    where: { preAuthorizationId: input.preAuthorizationId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;
  return db.preAuthorizationEvent.create({
    data: {
      tenantId: input.tenantId,
      preAuthorizationId: input.preAuthorizationId,
      sequence,
      eventType: input.eventType,
      priorStatus: input.priorStatus ?? null,
      newStatus: input.newStatus ?? null,
      safeReasonCode: input.safeReasonCode ?? null,
      internalReasonRef: input.internalReasonRef ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      dataVersionRef: input.dataVersionRef ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Ordered timeline for a PA (append order). */
export async function listPreauthEvents(preAuthorizationId: string, db: Db = prisma) {
  return db.preAuthorizationEvent.findMany({ where: { preAuthorizationId }, orderBy: { sequence: "asc" } });
}
