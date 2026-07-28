import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient, type DisbursementStatus } from "@prisma/client";
import Decimal from "decimal.js";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import { assertDisbursementTransition } from "./state-machine";

/**
 * PNOS F6.8 — provider disbursement record/confirm service.
 *
 * Finance records/releases/confirms the ACTUAL provider payment for an already
 * accounting-settled batch (§7.9, D16). Maker/checker (finance roles + maker ≠
 * checker by actor id), every transition a status- AND version-guarded CAS in a
 * serializable tx (F5.14 pattern), idempotent record, provider notification after
 * commit.
 *
 * FG-C7 (critical): this service NEVER mutates batch/voucher/GL state — it only
 * writes the ProviderDisbursement row. The batch is set SETTLED exclusively by the
 * canonical markSettlementBatchPaid (the atomic exactly-once gate), which this
 * service requires as a precondition and does not re-implement or bypass (spec
 * step 5). "Actually paid" is the disbursement's SUCCEEDED fact, not a new batch
 * state. Stop (F6.8): no bank integration.
 */

// = ROLES.FINANCE, as string literals so the service imports no rbac/next-auth graph.
export const DISBURSEMENT_FINANCE_ROLES = ["SUPER_ADMIN", "FINANCE_OFFICER"];

export interface DisbursementActor {
  userId: string;
  tenantId: string;
  role: string;
}

export type DisbursementServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "STALE"
  | "INVALID_STATE"
  | "INVALID"
  | "BATCH_NOT_SETTLED"
  | "OVER_DISBURSEMENT"
  | "SEPARATION_OF_DUTY"
  | "CONFLICT";

export class DisbursementServiceError extends Error {
  constructor(public code: DisbursementServiceErrorCode, message: string) {
    super(message);
    this.name = "DisbursementServiceError";
  }
}
export function isDisbursementServiceError(e: unknown): e is DisbursementServiceError {
  return e instanceof DisbursementServiceError;
}

type Db = PrismaClient | Prisma.TransactionClient;

// Amounts that still count against the batch total (exclude terminal FAILED/REVERSED).
const LIVE_STATUSES: DisbursementStatus[] = ["PENDING", "RELEASED", "PROCESSING", "SUCCEEDED"];

function assertFinance(actor: DisbursementActor): void {
  if (!DISBURSEMENT_FINANCE_ROLES.includes(actor.role)) {
    throw new DisbursementServiceError("FORBIDDEN", "Finance role required for disbursement operations.");
  }
}

export interface RecordDisbursementCommand {
  settlementBatchId: string;
  amount: number | string;
  currency: string;
  method: string;
  maskedDestination?: string;
  idempotencyKey?: string;
}

export interface ConfirmDisbursementCommand {
  externalReference: string;
  valueDate: Date;
  method?: string;
}

export interface DisbursementResult {
  id: string;
  status: DisbursementStatus;
  version: number;
  replayed?: boolean;
}

export const ProviderDisbursementService = {
  /**
   * Record a PENDING disbursement (maker) for a SETTLED batch with an issued
   * voucher. Currency must match the voucher; the amount plus all non-terminal
   * disbursements must not exceed the voucher total (over-disbursement guard).
   * Idempotent on idempotencyKey. Serializable so the sum+insert is atomic.
   */
  async record(actor: DisbursementActor, cmd: RecordDisbursementCommand, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    const amount = new Decimal(cmd.amount);
    if (amount.lte(0)) throw new DisbursementServiceError("INVALID", "Disbursement amount must be positive.");
    if (!cmd.method) throw new DisbursementServiceError("INVALID", "A disbursement method is required.");

    // Idempotent replay BEFORE the tx.
    if (cmd.idempotencyKey) {
      const existing = await db.providerDisbursement.findFirst({
        where: { tenantId: actor.tenantId, idempotencyKey: cmd.idempotencyKey },
        select: { id: true, status: true, version: true },
      });
      if (existing) return { id: existing.id, status: existing.status, version: existing.version, replayed: true };
    }

    let created: { id: string; status: DisbursementStatus; version: number; batchId: string };
    try {
      created = await inSerializable(db, async (tx) => {
        const batch = await tx.providerSettlementBatch.findFirst({
          where: { id: cmd.settlementBatchId, tenantId: actor.tenantId },
          select: { id: true, status: true, providerId: true, currency: true },
        });
        if (!batch) throw new DisbursementServiceError("NOT_FOUND", "Settlement batch not found.");
        if (batch.status !== "SETTLED") {
          throw new DisbursementServiceError("BATCH_NOT_SETTLED", "The batch must be settled (voucher issued) before a disbursement is recorded.");
        }
        const voucher = await tx.paymentVoucher.findFirst({
          where: { settlementBatchId: batch.id, tenantId: actor.tenantId },
          select: { totalAmount: true, currency: true },
          orderBy: { createdAt: "desc" },
        });
        if (!voucher) throw new DisbursementServiceError("INVALID", "No approved voucher exists for this batch.");
        if (cmd.currency !== voucher.currency) {
          throw new DisbursementServiceError("INVALID", `Currency ${cmd.currency} does not match the voucher currency ${voucher.currency}.`);
        }
        // Over-disbursement guard: existing live disbursements + this one must not exceed the voucher.
        const agg = await tx.providerDisbursement.aggregate({
          where: { tenantId: actor.tenantId, settlementBatchId: batch.id, status: { in: LIVE_STATUSES } },
          _sum: { amount: true },
        });
        const already = new Decimal(agg._sum.amount?.toString() ?? 0);
        if (already.plus(amount).greaterThan(new Decimal(voucher.totalAmount.toString()))) {
          throw new DisbursementServiceError(
            "OVER_DISBURSEMENT",
            `Disbursement ${amount.toFixed(2)} + already-live ${already.toFixed(2)} exceeds the voucher total ${new Decimal(voucher.totalAmount.toString()).toFixed(2)}.`,
          );
        }
        const row = await tx.providerDisbursement.create({
          data: {
            tenantId: actor.tenantId,
            providerId: batch.providerId,
            settlementBatchId: batch.id,
            status: "PENDING",
            amount: new Prisma.Decimal(amount.toFixed(2)),
            currency: cmd.currency,
            baseAmount: new Prisma.Decimal(amount.toFixed(2)),
            baseCurrency: batch.currency,
            method: cmd.method,
            maskedDestination: cmd.maskedDestination ?? null,
            initiatedById: actor.userId,
            initiatedAt: nowUtc(),
            idempotencyKey: cmd.idempotencyKey ?? null,
          },
          select: { id: true, status: true, version: true },
        });
        return { id: row.id, status: row.status, version: row.version, batchId: batch.id };
      });
    } catch (e) {
      // A same-key record raced us — the unique constraint aborted this tx; return the winner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && cmd.idempotencyKey) {
        const winner = await db.providerDisbursement.findFirst({
          where: { tenantId: actor.tenantId, idempotencyKey: cmd.idempotencyKey },
          select: { id: true, status: true, version: true },
        });
        if (winner) return { id: winner.id, status: winner.status, version: winner.version, replayed: true };
      }
      throw e;
    }

    await auditChainService.append({
      actorId: actor.userId, action: "DISBURSEMENT:RECORD", module: "FINANCE",
      entityType: "ProviderDisbursement", entityId: created.id, tenantId: actor.tenantId,
      payload: { batchId: created.batchId, amount: amount.toFixed(2), currency: cmd.currency },
      description: `Recorded provider disbursement ${amount.toFixed(2)} ${cmd.currency} for batch ${created.batchId}.`,
    });
    return { id: created.id, status: created.status, version: created.version };
  },

  /** PENDING → RELEASED (maker authorizes for payment). */
  async release(actor: DisbursementActor, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    return transition(db, actor, id, ["PENDING"], "RELEASED", expectedVersion, {}, "DISBURSEMENT:RELEASE");
  },

  /** RELEASED → PROCESSING (dispatched to the channel). */
  async markProcessing(actor: DisbursementActor, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    return transition(db, actor, id, ["RELEASED"], "PROCESSING", expectedVersion, {}, "DISBURSEMENT:PROCESSING");
  },

  /**
   * PROCESSING → SUCCEEDED (checker confirms the actual payment). Requires the
   * bank/channel reference + value date (§7.9 step 3). Maker ≠ checker: the
   * confirmer must not be the actor who recorded/initiated it. This is the
   * "actually paid" fact — it does NOT touch the batch/voucher status (FG-C7).
   */
  async confirm(actor: DisbursementActor, id: string, expectedVersion: number, cmd: ConfirmDisbursementCommand, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    if (!cmd.externalReference?.trim()) throw new DisbursementServiceError("INVALID", "A payment reference is required to confirm a disbursement.");
    if (!cmd.valueDate) throw new DisbursementServiceError("INVALID", "A value date is required to confirm a disbursement.");
    await assertSeparationOfDuty(db, actor, id);
    const res = await transition(
      db, actor, id, ["PROCESSING"], "SUCCEEDED", expectedVersion,
      { confirmedBy: true, externalReference: cmd.externalReference.trim(), valueDate: cmd.valueDate, ...(cmd.method ? { method: cmd.method } : {}) },
      "DISBURSEMENT:CONFIRM",
    );
    await notify(db, actor, id, "SETTLEMENT_DISBURSED", "Payment confirmed", "Your settlement has been paid; the remittance shows the payment reference.");
    return res;
  },

  /** {PENDING,RELEASED,PROCESSING} → FAILED. Safe + internal reasons separated. Terminal — a retry is a new record. */
  async fail(actor: DisbursementActor, id: string, expectedVersion: number, reasons: { safe: string; internal?: string }, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    return transition(
      db, actor, id, ["PENDING", "RELEASED", "PROCESSING"], "FAILED", expectedVersion,
      { failedBy: true, failureReasonSafe: reasons.safe, failureReasonInternal: reasons.internal ?? null },
      "DISBURSEMENT:FAIL",
    );
  },

  /** SUCCEEDED → REVERSED (checker; compensating). Never silently marks the batch unpaid. */
  async reverse(actor: DisbursementActor, id: string, expectedVersion: number, reasons: { safe: string; internal?: string }, db: PrismaClient = prisma): Promise<DisbursementResult> {
    assertFinance(actor);
    await assertSeparationOfDuty(db, actor, id);
    const res = await transition(
      db, actor, id, ["SUCCEEDED"], "REVERSED", expectedVersion,
      { reversedBy: true, failureReasonSafe: reasons.safe, failureReasonInternal: reasons.internal ?? null },
      "DISBURSEMENT:REVERSE",
    );
    await notify(db, actor, id, "SETTLEMENT_DISBURSEMENT_REVERSED", "Payment reversed", "A payment on your settlement was reversed; contact the payer for details.");
    return res;
  },
} as const;

// ── internals ────────────────────────────────────────────────────────────────

function nowUtc(): Date {
  return new Date();
}

async function inSerializable<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Maker ≠ checker: the confirming/reversing actor must differ from the initiator. */
async function assertSeparationOfDuty(db: Db, actor: DisbursementActor, id: string): Promise<void> {
  const row = await db.providerDisbursement.findFirst({
    where: { id, tenantId: actor.tenantId },
    select: { initiatedById: true },
  });
  if (!row) throw new DisbursementServiceError("NOT_FOUND", "Disbursement not found.");
  if (row.initiatedById && row.initiatedById === actor.userId) {
    throw new DisbursementServiceError("SEPARATION_OF_DUTY", "The confirming/reversing actor must be different from the one who recorded the disbursement.");
  }
}

interface TransitionData {
  confirmedBy?: boolean;
  failedBy?: boolean;
  reversedBy?: boolean;
  externalReference?: string;
  valueDate?: Date;
  method?: string;
  failureReasonSafe?: string;
  failureReasonInternal?: string | null;
}

/** Status- AND version-guarded CAS (F5.14). Zero rows ⇒ re-read to classify. Audit after. */
async function transition(
  db: PrismaClient,
  actor: DisbursementActor,
  id: string,
  from: DisbursementStatus[],
  to: DisbursementStatus,
  expectedVersion: number,
  data: TransitionData,
  auditAction: string,
): Promise<DisbursementResult> {
  // Defence in depth: the graph must permit every from→to (compile/runtime safety).
  for (const f of from) assertDisbursementTransition(f, to);
  const now = nowUtc();

  const result = await db.$transaction(async (tx) => {
    const cas = await tx.providerDisbursement.updateMany({
      where: { id, tenantId: actor.tenantId, version: expectedVersion, status: { in: from } },
      data: {
        status: to,
        version: { increment: 1 },
        ...(data.confirmedBy ? { confirmedById: actor.userId, confirmedAt: now } : {}),
        ...(data.failedBy ? { failedById: actor.userId, failedAt: now } : {}),
        ...(data.reversedBy ? { reversedById: actor.userId, reversedAt: now } : {}),
        ...(data.externalReference !== undefined ? { externalReference: data.externalReference } : {}),
        ...(data.valueDate !== undefined ? { valueDate: data.valueDate } : {}),
        ...(data.method !== undefined ? { method: data.method } : {}),
        ...(data.failureReasonSafe !== undefined ? { failureReasonSafe: data.failureReasonSafe } : {}),
        ...(data.failureReasonInternal !== undefined ? { failureReasonInternal: data.failureReasonInternal } : {}),
      },
    });
    if (cas.count === 0) {
      const cur = await tx.providerDisbursement.findFirst({ where: { id, tenantId: actor.tenantId }, select: { status: true, version: true } });
      if (!cur) throw new DisbursementServiceError("NOT_FOUND", "Disbursement not found.");
      if (cur.version !== expectedVersion) throw new DisbursementServiceError("STALE", "This disbursement changed since you loaded it — refresh and retry.");
      throw new DisbursementServiceError("INVALID_STATE", `A ${cur.status.toLowerCase()} disbursement cannot take this action.`);
    }
    const fresh = await tx.providerDisbursement.findFirst({ where: { id }, select: { version: true } });
    return { version: fresh?.version ?? expectedVersion + 1 };
  });

  await auditChainService.append({
    actorId: actor.userId, action: auditAction, module: "FINANCE",
    entityType: "ProviderDisbursement", entityId: id, tenantId: actor.tenantId,
    payload: { to },
    description: `Disbursement ${id} → ${to.toLowerCase()}.`,
  });

  return { id, status: to, version: result.version };
}

async function notify(db: Db, actor: DisbursementActor, id: string, eventType: string, title: string, body: string): Promise<void> {
  const row = await db.providerDisbursement.findFirst({ where: { id, tenantId: actor.tenantId }, select: { providerId: true, settlementBatchId: true } });
  if (!row) return;
  await NotificationOutboxService.enqueue({
    tenantId: actor.tenantId, providerId: row.providerId, channel: "IN_APP", eventType, priority: "NORMAL",
    title, body, href: `/provider/settlements/${row.settlementBatchId}`,
    metadata: { disbursementId: id, settlementBatchId: row.settlementBatchId },
    dedupeKey: `${eventType}:${id}`,
  }).catch(() => undefined);
}
