/**
 * Claims Autopilot — receipt reservation and replay semantics (F2.2).
 *
 * Concurrent submissions under the same (tenant, scopeKey, channel,
 * idempotencyKey) resolve to exactly ONE authoritative receipt:
 *   - first writer wins the unique constraint → RESERVED;
 *   - a same-request-hash loser reads the original → REPLAY;
 *   - a different-request-hash loser → CONFLICT, and NEVER mutates the original.
 *
 * Terminal transitions are conditional on `state = PROCESSING` so a late loser
 * can never overwrite a committed success (§8.6, §11.4).
 *
 * Pure repository: takes an explicit Prisma client/transaction so it composes
 * inside the intake transaction (F3.3) and constructs no client on import.
 */
import { Prisma, type PrismaClient, type ClaimIntakeChannel, type ClaimIntakeReceipt } from "@prisma/client";
import { IntakeError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

/** Server-derived scope keys (§8.1). Defensive — context (F3.1) builds these. */
const SCOPE_KEY_RE = /^(user|provider|device|case|preauth|reimbursement|integration):[^\s]{1,180}$/;

export function assertValidScopeKey(scopeKey: string): void {
  if (!SCOPE_KEY_RE.test(scopeKey)) {
    throw IntakeError.authorization("Invalid submission scope.", { scopeKeyPrefix: scopeKey.slice(0, 20) });
  }
}

export interface ReceiptReservationInput {
  tenantId: string;
  scopeKey: string;
  channel: ClaimIntakeChannel;
  idempotencyKey: string;
  schemaVersion: string;
  requestHash: string;
  strongEventFingerprint: string | null;
  suspectedDuplicateFingerprint: string;
  correlationId: string;
}

export type ReservationResult =
  | { kind: "RESERVED"; receipt: ClaimIntakeReceipt }
  | { kind: "REPLAY"; receipt: ClaimIntakeReceipt }
  | { kind: "CONFLICT"; receipt: ClaimIntakeReceipt };

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Reserve (or resolve a replay/conflict for) a receipt. Idempotent under
 * concurrency: exactly one caller receives RESERVED for a given scoped key.
 */
export async function reserveReceipt(db: Db, input: ReceiptReservationInput): Promise<ReservationResult> {
  assertValidScopeKey(input.scopeKey);
  try {
    const receipt = await db.claimIntakeReceipt.create({
      data: {
        tenantId: input.tenantId,
        scopeKey: input.scopeKey,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        schemaVersion: input.schemaVersion,
        requestHash: input.requestHash,
        strongEventFingerprint: input.strongEventFingerprint,
        suspectedDuplicateFingerprint: input.suspectedDuplicateFingerprint,
        correlationId: input.correlationId,
        state: "PROCESSING",
      },
    });
    return { kind: "RESERVED", receipt };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Someone else reserved first — read the authoritative row and classify.
    const existing = await db.claimIntakeReceipt.findUnique({
      where: {
        tenantId_scopeKey_channel_idempotencyKey: {
          tenantId: input.tenantId,
          scopeKey: input.scopeKey,
          channel: input.channel,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    // The row must exist (we just collided with it). If a concurrent rollback
    // removed it, this is transient — the caller may retry the same key.
    if (!existing) throw IntakeError.retryable(undefined, { reason: "receipt vanished after unique collision" });
    if (existing.requestHash === input.requestHash) return { kind: "REPLAY", receipt: existing };
    return { kind: "CONFLICT", receipt: existing }; // original returned unchanged; no mutation
  }
}

/** Look up a receipt by its scoped key (for status polling / recovery). */
export function findReceiptByKey(
  db: Db,
  key: { tenantId: string; scopeKey: string; channel: ClaimIntakeChannel; idempotencyKey: string },
): Promise<ClaimIntakeReceipt | null> {
  return db.claimIntakeReceipt.findUnique({
    where: { tenantId_scopeKey_channel_idempotencyKey: key },
  });
}

export interface TerminalReceiptUpdate {
  outcomeCode?: string | null;
  safeMessage?: string | null;
  httpStatus?: number | null;
  claimId?: string | null;
}

/**
 * Conditionally move a PROCESSING receipt to a terminal state. Returns true iff
 * THIS call performed the transition — a second call (or a late loser) sees a
 * non-PROCESSING state and updates nothing, so success can never be overwritten.
 */
async function transition(
  db: Db,
  receiptId: string,
  state: "SUCCEEDED" | "REJECTED" | "FAILED",
  update: TerminalReceiptUpdate,
): Promise<boolean> {
  const res = await db.claimIntakeReceipt.updateMany({
    where: { id: receiptId, state: "PROCESSING" },
    data: {
      state,
      outcomeCode: update.outcomeCode ?? undefined,
      safeMessage: update.safeMessage ?? undefined,
      httpStatus: update.httpStatus ?? undefined,
      claimId: update.claimId ?? undefined,
      completedAt: new Date(),
    },
  });
  return res.count === 1;
}

export function markReceiptSucceeded(db: Db, receiptId: string, update: TerminalReceiptUpdate): Promise<boolean> {
  return transition(db, receiptId, "SUCCEEDED", update);
}

export function markReceiptRejected(db: Db, receiptId: string, update: TerminalReceiptUpdate): Promise<boolean> {
  return transition(db, receiptId, "REJECTED", update);
}

export function markReceiptFailed(db: Db, receiptId: string, update: TerminalReceiptUpdate): Promise<boolean> {
  return transition(db, receiptId, "FAILED", update);
}
