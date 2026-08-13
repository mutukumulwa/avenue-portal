/**
 * UAT-HF P12.01 — service-level observability and support lookup.
 *
 * Acceptance: "alert thresholds and runbook link to operation/correlation lookup
 * **without database console access**."
 *
 * That last clause is the requirement. Today, answering "did this operator's
 * save actually commit?" means someone with production database credentials
 * runs a query — which is slow, unauditable, and hands a support engineer far
 * more access than the question needs. P01.02 built the actor-scoped endpoint a
 * *user* can call for their own operation; this is the tenant-scoped one a
 * *support operator* can call for somebody else's, behind a permission.
 *
 * ## What this deliberately does not return
 *
 * The privacy rules DEF-057, DEF-078 and DEF-079 established apply with more
 * force here, because the caller is looking at another person's activity:
 *
 *   * no request payload and no request hash — the receipt's `requestHash`
 *     exists to detect a replay with different content, not to be read back;
 *   * no member number, national ID, phone or email — the entity is identified
 *     by `entityType` + opaque `entityId`, and `entityRef` only where it is
 *     already a non-identifying business reference (an endorsement number);
 *   * no `sourceClause` or other internal policy text.
 *
 * A support engineer needs to know *whether* something committed and *what
 * happened next*. Neither question requires the data itself.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Permission required to look up another user's operation within the tenant. */
export const SUPPORT_LOOKUP_PERMISSION = "support.operation.lookup";

export function maySupportLookup(permissions: readonly string[] | undefined): boolean {
  return !!permissions?.includes(SUPPORT_LOOKUP_PERMISSION);
}

export interface SupportTimelineEntry {
  at: Date;
  kind: "RECEIPT" | "EVENT" | "AUDIT";
  label: string;
  detail: string | null;
}

export interface SupportLookupResult {
  found: boolean;
  operationId: string | null;
  correlationId: string | null;
  operationType: string | null;
  state: string | null;
  resultCode: string | null;
  entityType: string | null;
  entityId: string | null;
  entityRef: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
  /** Receipt, then the events and audit rows sharing its correlation id. */
  timeline: SupportTimelineEntry[];
  /** Plain-language answer to "did it commit?" — the question support is asked. */
  verdict: string;
}

const NOT_FOUND: SupportLookupResult = {
  found: false,
  operationId: null, correlationId: null, operationType: null, state: null,
  resultCode: null, entityType: null, entityId: null, entityRef: null,
  createdAt: null, completedAt: null, timeline: [],
  verdict: "No operation with that reference in this organisation.",
};

/**
 * Turn a receipt state into the sentence a support engineer needs.
 *
 * `UNKNOWN` is the state that matters. DEF-065 is exactly this: the operator saw
 * a crash and could not tell whether the write landed. Saying "unknown" plainly,
 * with what to do about it, beats a status code.
 */
function verdictFor(state: string, entityId: string | null): string {
  switch (state) {
    case "SUCCEEDED":
      return entityId
        ? "Committed. The record exists and the operation completed."
        : "Committed. The operation completed.";
    case "FAILED":
      return "Did not commit. The operation failed and nothing was written — it is safe to retry.";
    case "PROCESSING":
      return "Still running. Do not retry yet; a second attempt with the same reference is ignored, but a NEW submission would be a second request.";
    case "RECEIVED":
      return "Accepted but not started. Safe to wait.";
    case "UNKNOWN":
      return "OUTCOME UNKNOWN — the process died between writing and confirming. Check the entity below before advising a retry; this is the case a retry can duplicate.";
    default:
      return `State ${state}.`;
  }
}

/**
 * Look up one operation for support, tenant-scoped.
 *
 * Accepts either the opaque operation id (the client's idempotency key, which is
 * what an operator sees on screen) or a correlation id.
 */
export async function lookupForSupport(
  input: { tenantId: string; reference: string },
  db: Db = prisma,
): Promise<SupportLookupResult> {
  const reference = input.reference.trim();
  if (!reference) return NOT_FOUND;

  const receipt = await db.operationReceipt.findFirst({
    where: {
      tenantId: input.tenantId,
      OR: [{ idempotencyKey: reference }, { correlationId: reference }],
    },
    orderBy: { createdAt: "desc" },
    // Explicit select: `requestHash` must not leave the database.
    select: {
      idempotencyKey: true, correlationId: true, operationType: true, state: true,
      resultCode: true, entityType: true, entityId: true, entityRef: true,
      createdAt: true, completedAt: true,
    },
  });

  if (!receipt) return NOT_FOUND;

  const timeline: SupportTimelineEntry[] = [
    {
      at: receipt.createdAt,
      kind: "RECEIPT",
      label: `${receipt.operationType} — ${receipt.state}`,
      detail: receipt.resultCode,
    },
  ];

  const correlationId = receipt.correlationId;
  if (correlationId) {
    // NOTE: `AuditLog` is deliberately absent from this join, and that is a
    // finding rather than an omission. It carries no `correlationId` column, so
    // an audit row cannot be tied to the operation that produced it — see
    // UNINSTRUMENTED below. `DomainEvent` does carry one, which is why the
    // outbox (P01.03) can be traced and the audit trail cannot.
    const events = await db.domainEvent.findMany({
      where: { tenantId: input.tenantId, correlationId },
      orderBy: { occurredAt: "asc" },
      // No `payload` — it carries the business data this lookup must not show.
      select: { occurredAt: true, eventType: true, projectionState: true, projectionError: true },
    });

    for (const e of events) {
      timeline.push({
        at: e.occurredAt,
        kind: "EVENT",
        label: e.eventType,
        detail: e.projectionState === "PROJECTED" ? null : `projection ${e.projectionState}${e.projectionError ? `: ${e.projectionError}` : ""}`,
      });
    }
  }

  timeline.sort((x, y) => x.at.getTime() - y.at.getTime());

  return {
    found: true,
    operationId: receipt.idempotencyKey,
    correlationId: receipt.correlationId,
    operationType: receipt.operationType,
    state: receipt.state,
    resultCode: receipt.resultCode,
    entityType: receipt.entityType,
    entityId: receipt.entityId,
    entityRef: receipt.entityRef,
    createdAt: receipt.createdAt,
    completedAt: receipt.completedAt,
    timeline,
    verdict: verdictFor(receipt.state, receipt.entityId),
  };
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export interface MetricReading {
  key: string;
  label: string;
  value: number;
  /** Above this, the runbook says act. Null where no threshold is agreed yet. */
  threshold: number | null;
  breached: boolean;
  runbook: string;
}

/**
 * The counters P12.01 lists, for the ones this schema can actually answer.
 *
 * Deliberately honest about coverage: the plan names eleven metric families and
 * several have no data source yet (eligibility reason distribution, invalid
 * legacy dates, error-boundary events are client-side). Reporting a metric as
 * `0` when nothing records it would be worse than not reporting it — a zero
 * reads as health. Those are listed in `UNINSTRUMENTED` instead.
 */
export const UNINSTRUMENTED: ReadonlyArray<{ metric: string; why: string }> = [
  { metric: "eligibility reasons / unavailable", why: "The evaluator returns reason codes but nothing persists a decision log; needs an eligibility-decision table." },
  { metric: "invalid legacy dates", why: "P02.03's repair path records overrides, but there is no standing scan of remaining invalid rows." },
  { metric: "error-boundary events", why: "P01.04's boundaries render client-side and report nowhere; needs a client error sink." },
  { metric: "notification failures", why: "The notification worker is unprovisioned in production, so a zero here would mean 'nothing ran', not 'nothing failed'." },
  { metric: "audit rows joined to their operation", why: "AuditLog has no correlationId column, so an audit entry cannot be tied to the operation that produced it. DomainEvent can. Adding it is additive and would complete the support timeline." },
];

export async function observabilityMetrics(
  tenantId: string,
  db: Db = prisma,
): Promise<{ readings: MetricReading[]; uninstrumented: typeof UNINSTRUMENTED }> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);

  const [unknown, processingStale, outboxPending, outboxFailed, importsStuck] = await Promise.all([
    db.operationReceipt.count({ where: { tenantId, state: "UNKNOWN" } }),
    // A receipt still PROCESSING after an hour is a stalled write, not a slow one.
    db.operationReceipt.count({
      where: { tenantId, state: "PROCESSING", createdAt: { lt: new Date(now.getTime() - 3_600_000) } },
    }),
    db.domainEvent.count({ where: { tenantId, projectionState: "PENDING" } }),
    db.domainEvent.count({ where: { tenantId, projectionState: "FAILED" } }),
    db.importBatch.count({
      where: { tenantId, status: { in: ["QUEUED", "PROCESSING"] }, createdAt: { lt: dayAgo } },
    }),
  ]);

  const readings: MetricReading[] = [
    {
      key: "mutation.unknown",
      label: "Operations with an UNKNOWN outcome",
      value: unknown,
      threshold: 0,
      breached: unknown > 0,
      runbook: "Each one is a write that may or may not have committed (DEF-065). Resolve individually via support lookup before advising any retry.",
    },
    {
      key: "mutation.stalled",
      label: "Operations PROCESSING for over an hour",
      value: processingStale,
      threshold: 0,
      breached: processingStale > 0,
      runbook: "The process died mid-write. Check the entity, then mark the receipt UNKNOWN or FAILED — leaving it PROCESSING blocks the operator's retry.",
    },
    {
      key: "outbox.backlog",
      label: "Domain events awaiting projection",
      value: outboxPending,
      threshold: 100,
      breached: outboxPending > 100,
      runbook: "The projection worker is behind or stopped. Audit trails and activity feeds lag until it drains; the events themselves are safe.",
    },
    {
      key: "outbox.failed",
      label: "Domain events whose projection FAILED",
      value: outboxFailed,
      threshold: 0,
      breached: outboxFailed > 0,
      runbook: "A projection error is a missing audit row, not a missing business effect. Read projectionError, fix, and re-run the projector.",
    },
    {
      key: "import.stuck",
      label: "Imports queued or processing for over 24 hours",
      value: importsStuck,
      threshold: 0,
      breached: importsStuck > 0,
      runbook: "The import worker stopped mid-batch. The row ledger makes completion reconstructible — resume rather than re-upload, or the file commits twice.",
    },
  ];

  return { readings, uninstrumented: UNINSTRUMENTED };
}
