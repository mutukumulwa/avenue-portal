/**
 * UAT-HF P01.02 — durable operation receipts.
 *
 * The human-factors run could not answer one question: *did my submit land?*
 *
 *   DEF-065  a dropped response destroyed the operator's input and hid a write
 *            that HAD committed — the server returned 200 and created
 *            UX26-2026-00037 while the screen showed only a crash
 *   DEF-034  a double-click on Register Member silently discarded the enrolment
 *   DEF-068  a dropped import confirm left no way to learn the outcome
 *
 * A receipt is a durable row for one *intended business effect*, reserved BEFORE
 * the write and completed in the SAME transaction as it. Because the key is chosen
 * by the client before it sends anything, a retry is recognisable as the same
 * intent rather than a new one.
 *
 * The rules, in order of importance:
 *
 *   1. Same key + same payload + already SUCCEEDED  → replay the stored result.
 *      Never write twice.
 *   2. Same key + DIFFERENT payload                 → conflict. The client reused
 *      an idempotency key for a different request; refuse rather than guess.
 *   3. Same key while still in flight               → do not write. A second
 *      submit must not race the first.
 *   4. Prior attempt UNKNOWN                        → never auto-retry. Escalate.
 *
 * Only a provably FAILED prior attempt may be retried under the same key.
 */
import { createHash } from "node:crypto";
import { Prisma, type OperationReceipt, type OperationReceiptState } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Accepts either the root client or a transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

export interface ReserveInput {
  tenantId: string;
  actorId: string;
  /** Stable command name, e.g. "members.create". */
  operationType: string;
  /** The client-chosen key, resent unchanged on every retry of this intent. */
  idempotencyKey: string;
  /** The request payload; hashed canonically to detect key reuse. */
  request: unknown;
  correlationId?: string;
}

export type ReserveOutcome =
  /** Nothing has run for this key. Proceed with the write. */
  | { status: "RESERVED"; receipt: OperationReceipt }
  /** Already committed. Return the stored reference; do NOT write. */
  | { status: "REPLAY"; receipt: OperationReceipt }
  /** An attempt is in flight. Do NOT write. */
  | { status: "IN_PROGRESS"; receipt: OperationReceipt }
  /** Same key, different payload. Refuse. */
  | { status: "CONFLICT"; receipt: OperationReceipt }
  /** A prior attempt's outcome is unknown. Never auto-retry. */
  | { status: "UNKNOWN_PRIOR"; receipt: OperationReceipt };

/** Safe projection for the status lookup — no request hash, no payload, no PII. */
export interface OperationStatus {
  operationId: string;
  operationType: string;
  state: OperationReceiptState;
  entityRef: string | null;
  entityType: string | null;
  entityId: string | null;
  resultCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Canonical JSON: object keys sorted at every depth so two structurally identical
 * payloads hash the same regardless of property order. `undefined` is dropped, as
 * JSON would drop it anyway.
 */
export function canonicalize(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date) return v.toISOString();
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const child = (v as Record<string, unknown>)[key];
        if (child !== undefined) acc[key] = walk(child);
        return acc;
      }, {});
  };
  return JSON.stringify(walk(value));
}

export function hashRequest(request: unknown): string {
  return createHash("sha256").update(canonicalize(request)).digest("hex");
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

export const OperationReceiptService = {
  canonicalize,
  hashRequest,

  /**
   * Claim the right to perform this intent exactly once.
   *
   * Call this BEFORE the business write. Pass the same `db` you will use for the
   * write when you can, so reservation and write share a transaction.
   */
  async reserve(input: ReserveInput, db: Db = prisma): Promise<ReserveOutcome> {
    const requestHash = hashRequest(input.request);
    const key = {
      tenantId: input.tenantId,
      actorId: input.actorId,
      operationType: input.operationType,
      idempotencyKey: input.idempotencyKey,
    };

    try {
      const receipt = await db.operationReceipt.create({
        data: { ...key, requestHash, correlationId: input.correlationId, state: "PROCESSING" },
      });
      return { status: "RESERVED", receipt };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }

    // The unique index is the real guard: two concurrent submits race here and
    // exactly one wins the create. The loser lands below and must not write.
    const existing = await db.operationReceipt.findUnique({
      where: { tenantId_actorId_operationType_idempotencyKey: key },
    });

    // Vanishingly rare: the row was removed between the failed create and this
    // read. Treat as in-flight rather than inventing a second write.
    if (!existing) {
      throw new Error("operation receipt disappeared between create and read");
    }

    // Rule 2 — same key, different request. Refuse before considering state.
    if (existing.requestHash !== requestHash) {
      return { status: "CONFLICT", receipt: existing };
    }

    switch (existing.state) {
      case "SUCCEEDED":
        return { status: "REPLAY", receipt: existing };
      case "UNKNOWN":
        return { status: "UNKNOWN_PRIOR", receipt: existing };
      case "FAILED": {
        // Provably did not commit, so the same intent may be attempted again.
        // Conditional on state so a concurrent retry cannot double-claim it.
        const claimed = await db.operationReceipt.updateMany({
          where: { id: existing.id, state: "FAILED" },
          data: { state: "PROCESSING", resultCode: null, completedAt: null, correlationId: input.correlationId },
        });
        if (claimed.count === 0) {
          const current = await db.operationReceipt.findUnique({ where: { id: existing.id } });
          return { status: "IN_PROGRESS", receipt: current ?? existing };
        }
        const receipt = await db.operationReceipt.findUniqueOrThrow({ where: { id: existing.id } });
        return { status: "RESERVED", receipt };
      }
      default:
        // RECEIVED / PROCESSING — an attempt is in flight.
        return { status: "IN_PROGRESS", receipt: existing };
    }
  },

  /**
   * Mark the intent committed. Call inside the SAME transaction as the business
   * write, so a receipt can never claim success for a write that rolled back.
   */
  async succeed(
    receiptId: string,
    result: { entityType?: string; entityId?: string; entityRef?: string; resultCode?: string },
    db: Db = prisma,
  ): Promise<OperationReceipt> {
    return db.operationReceipt.update({
      where: { id: receiptId },
      data: {
        state: "SUCCEEDED",
        completedAt: new Date(),
        entityType: result.entityType,
        entityId: result.entityId,
        entityRef: result.entityRef,
        resultCode: result.resultCode ?? "OK",
      },
    });
  },

  /**
   * Mark the intent as provably not committed. Only use this when the write is
   * known to have rolled back — otherwise use `markUnknown`.
   */
  async markFailed(receiptId: string, resultCode: string, db: Db = prisma): Promise<void> {
    await db.operationReceipt.updateMany({
      where: { id: receiptId, state: { in: ["RECEIVED", "PROCESSING"] } },
      data: { state: "FAILED", completedAt: new Date(), resultCode },
    });
  },

  /**
   * Mark the intent's outcome as undetermined. This is the honest state after a
   * timeout or a lost connection mid-commit, and it deliberately blocks retries.
   */
  async markUnknown(receiptId: string, resultCode = "UNKNOWN_OUTCOME", db: Db = prisma): Promise<void> {
    await db.operationReceipt.updateMany({
      where: { id: receiptId, state: { in: ["RECEIVED", "PROCESSING"] } },
      data: { state: "UNKNOWN", completedAt: new Date(), resultCode },
    });
  },

  /**
   * Authorized status lookup by the opaque operation id.
   *
   * Scoped to the caller's tenant, and to the actor unless the caller holds a
   * support permission. The key is the client's random idempotency key — never a
   * member number, card number or any other identifier (DEF-057, DEF-079).
   */
  async lookup(
    params: { tenantId: string; idempotencyKey: string; actorId?: string; operationType?: string },
    db: Db = prisma,
  ): Promise<OperationStatus | null> {
    const receipt = await db.operationReceipt.findFirst({
      where: {
        tenantId: params.tenantId,
        idempotencyKey: params.idempotencyKey,
        ...(params.actorId ? { actorId: params.actorId } : {}),
        ...(params.operationType ? { operationType: params.operationType } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!receipt) return null;
    return {
      operationId: receipt.idempotencyKey,
      operationType: receipt.operationType,
      state: receipt.state,
      entityRef: receipt.entityRef,
      entityType: receipt.entityType,
      entityId: receipt.entityId,
      resultCode: receipt.resultCode,
      createdAt: receipt.createdAt,
      completedAt: receipt.completedAt,
    };
  },
};
