import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient, type PaymentQueryCategory, type PaymentQueryStatus } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import {
  canTransitionPaymentQuery,
  PROVIDER_WITHDRAWABLE,
  toProviderPaymentQueryProjection,
  toProviderPaymentQueryTimeline,
} from "./policy";

/**
 * PNOS F6.10 — provider payment query service (D17).
 *
 * A provider idempotently raises a query about settlement/payment facts and both
 * sides collaborate through a status lifecycle — WITHOUT ever changing a claim
 * decision (this service writes ONLY the ProviderPaymentQuery + its messages;
 * never a Claim/decision/settlement). A decision dispute becomes an explicit
 * reconsideration through the F6.12 handoff — not built here. Stop (F6.10): no UI,
 * no query→reconsideration conversion.
 */

export const PAYMENT_QUERY_PERMISSION = "provider.payment_query.manage";
const PAYMENT_QUERY_FINANCE_ROLES = ["SUPER_ADMIN", "FINANCE_OFFICER"];

export type PaymentQueryErrorCode = "NOT_FOUND" | "FORBIDDEN" | "STALE" | "INVALID_STATE" | "INVALID";
export class PaymentQueryError extends Error {
  constructor(public code: PaymentQueryErrorCode, message: string) {
    super(message);
    this.name = "PaymentQueryError";
  }
}
export function isPaymentQueryError(e: unknown): e is PaymentQueryError {
  return e instanceof PaymentQueryError;
}

export interface FinanceActor {
  userId: string;
  tenantId: string;
  role: string;
}

export interface RaisePaymentQueryCommand {
  settlementBatchId: string;
  claimId?: string;
  claimLineId?: string;
  disbursementId?: string;
  category: PaymentQueryCategory;
  discrepancyAmount?: number | string;
  discrepancyCurrency?: string;
  narrative: string;
  providerBranchId?: string;
  idempotencyKey?: string;
}

export interface PaymentQueryResult {
  id: string;
  status: PaymentQueryStatus;
  version: number;
  replayed?: boolean;
}

async function appendMessage(
  tx: Prisma.TransactionClient,
  m: { tenantId: string; paymentQueryId: string; audience: "SHARED" | "INTERNAL"; eventType: string; priorStatus?: string | null; newStatus?: string | null; body?: string | null; actorType: string; actorId?: string | null },
): Promise<void> {
  const last = await tx.providerPaymentQueryMessage.findFirst({ where: { paymentQueryId: m.paymentQueryId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  await tx.providerPaymentQueryMessage.create({
    data: {
      tenantId: m.tenantId, paymentQueryId: m.paymentQueryId, sequence: (last?.sequence ?? 0) + 1,
      audience: m.audience, eventType: m.eventType, priorStatus: m.priorStatus ?? null, newStatus: m.newStatus ?? null,
      body: m.body ?? null, actorType: m.actorType, actorId: m.actorId ?? null,
    },
  });
}

export const ProviderPaymentQueryService = {
  /**
   * Provider raises a query. Scope: the settlement batch (and any claim/
   * disbursement target) must belong to the caller's provider. Idempotent on
   * idempotencyKey. Creates OPEN + a first RAISED (SHARED) message.
   */
  async raise(ctx: ProviderAccessContext, cmd: RaisePaymentQueryCommand, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    ProviderAccessService.requirePermission(ctx, PAYMENT_QUERY_PERMISSION);
    if (!cmd.narrative?.trim()) throw new PaymentQueryError("INVALID", "A narrative is required.");
    if (cmd.discrepancyAmount != null && Number(cmd.discrepancyAmount) < 0) throw new PaymentQueryError("INVALID", "Discrepancy amount cannot be negative.");

    // Non-enumerating provider scope on the batch + optional finer targets.
    const batch = await db.providerSettlementBatch.findFirst({ where: { id: cmd.settlementBatchId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true } });
    if (!batch) throw new PaymentQueryError("NOT_FOUND", "Settlement batch not found.");
    if (cmd.claimId) {
      const claim = await db.claim.findFirst({ where: { id: cmd.claimId, tenantId: ctx.tenantId, providerId: ctx.providerId, settlementBatchId: cmd.settlementBatchId }, select: { id: true } });
      if (!claim) throw new PaymentQueryError("INVALID", "The referenced claim is not part of this settlement.");
    }
    if (cmd.disbursementId) {
      const d = await db.providerDisbursement.findFirst({ where: { id: cmd.disbursementId, tenantId: ctx.tenantId, providerId: ctx.providerId, settlementBatchId: cmd.settlementBatchId }, select: { id: true } });
      if (!d) throw new PaymentQueryError("INVALID", "The referenced disbursement is not part of this settlement.");
    }

    if (cmd.idempotencyKey) {
      const existing = await db.providerPaymentQuery.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: cmd.idempotencyKey }, select: { id: true, status: true, version: true } });
      if (existing) return { ...existing, replayed: true };
    }

    let created: { id: string; status: PaymentQueryStatus; version: number };
    try {
      created = await db.$transaction(async (tx) => {
        const row = await tx.providerPaymentQuery.create({
          data: {
            tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: cmd.providerBranchId ?? null,
            settlementBatchId: cmd.settlementBatchId, claimId: cmd.claimId ?? null, claimLineId: cmd.claimLineId ?? null, disbursementId: cmd.disbursementId ?? null,
            category: cmd.category,
            discrepancyAmount: cmd.discrepancyAmount != null ? new Prisma.Decimal(String(cmd.discrepancyAmount)) : null,
            discrepancyCurrency: cmd.discrepancyCurrency ?? null,
            providerNarrative: cmd.narrative.trim(), status: "OPEN", providerRequesterId: ctx.actorId,
            idempotencyKey: cmd.idempotencyKey ?? null,
          },
          select: { id: true, status: true, version: true },
        });
        await appendMessage(tx, { tenantId: ctx.tenantId, paymentQueryId: row.id, audience: "SHARED", eventType: "RAISED", newStatus: "OPEN", body: cmd.narrative.trim(), actorType: "PROVIDER_USER", actorId: ctx.actorId });
        return row;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && cmd.idempotencyKey) {
        const winner = await db.providerPaymentQuery.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: cmd.idempotencyKey }, select: { id: true, status: true, version: true } });
        if (winner) return { ...winner, replayed: true };
      }
      throw e;
    }

    await auditChainService.append({
      actorId: ctx.actorId, action: "PAYMENT_QUERY:RAISE", module: "FINANCE",
      entityType: "ProviderPaymentQuery", entityId: created.id, tenantId: ctx.tenantId,
      payload: { batchId: cmd.settlementBatchId, category: cmd.category }, description: `Provider raised a ${cmd.category} payment query on batch ${cmd.settlementBatchId}.`,
    });
    return created;
  },

  /** Provider answers an information request (INFORMATION_REQUIRED → PROVIDER_RESPONDED). */
  async respondToInformation(ctx: ProviderAccessContext, id: string, expectedVersion: number, body: string, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    ProviderAccessService.requirePermission(ctx, PAYMENT_QUERY_PERMISSION);
    if (!body?.trim()) throw new PaymentQueryError("INVALID", "A response is required.");
    await assertProviderOwns(db, ctx, id);
    return runTransition(db, { actorId: ctx.actorId, actorType: "PROVIDER_USER", tenantId: ctx.tenantId, providerId: ctx.providerId }, id, ["INFORMATION_REQUIRED"], "PROVIDER_RESPONDED", expectedVersion, {}, { eventType: "PROVIDER_RESPONDED", audience: "SHARED", body: body.trim(), auditAction: "PAYMENT_QUERY:RESPOND" });
  },

  /** Provider withdraws its own query before resolution. */
  async withdraw(ctx: ProviderAccessContext, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    ProviderAccessService.requirePermission(ctx, PAYMENT_QUERY_PERMISSION);
    await assertProviderOwns(db, ctx, id);
    return runTransition(db, { actorId: ctx.actorId, actorType: "PROVIDER_USER", tenantId: ctx.tenantId, providerId: ctx.providerId }, id, PROVIDER_WITHDRAWABLE, "WITHDRAWN", expectedVersion, {}, { eventType: "WITHDRAWN", audience: "SHARED", auditAction: "PAYMENT_QUERY:WITHDRAW" });
  },

  // ── finance side (never changes a claim decision, D17) ──────────────────────
  async acknowledge(actor: FinanceActor, id: string, expectedVersion: number, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    assertFinance(actor);
    return runTransition(db, { actorId: actor.userId, actorType: "TPA_USER", tenantId: actor.tenantId }, id, ["OPEN", "PROVIDER_RESPONDED"], "ACKNOWLEDGED", expectedVersion, { assignedReviewerId: actor.userId }, { eventType: "ACKNOWLEDGED", audience: "SHARED", auditAction: "PAYMENT_QUERY:ACKNOWLEDGE", notify: { title: "Payment query acknowledged", body: "We are reviewing your payment query." } });
  },
  async requestInformation(actor: FinanceActor, id: string, expectedVersion: number, prompt: string, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    assertFinance(actor);
    if (!prompt?.trim()) throw new PaymentQueryError("INVALID", "A prompt is required.");
    return runTransition(db, { actorId: actor.userId, actorType: "TPA_USER", tenantId: actor.tenantId }, id, ["OPEN", "ACKNOWLEDGED", "PROVIDER_RESPONDED"], "INFORMATION_REQUIRED", expectedVersion, {}, { eventType: "INFO_REQUESTED", audience: "SHARED", body: prompt.trim(), auditAction: "PAYMENT_QUERY:REQUEST_INFO", notify: { title: "More information needed", body: prompt.trim() } });
  },
  async resolve(actor: FinanceActor, id: string, expectedVersion: number, input: { code: string; explanation: string; internalNote?: string }, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    assertFinance(actor);
    if (!input.explanation?.trim()) throw new PaymentQueryError("INVALID", "A resolution explanation is required.");
    return runTransition(db, { actorId: actor.userId, actorType: "TPA_USER", tenantId: actor.tenantId }, id, ["ACKNOWLEDGED", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"], "RESOLVED", expectedVersion, { resolutionCode: input.code, resolutionExplanation: input.explanation.trim(), resolutionInternalNote: input.internalNote ?? null }, { eventType: "RESOLVED", audience: "SHARED", body: input.explanation.trim(), auditAction: "PAYMENT_QUERY:RESOLVE", notify: { title: "Payment query resolved", body: input.explanation.trim() } });
  },
  async reject(actor: FinanceActor, id: string, expectedVersion: number, input: { code: string; explanation: string }, db: PrismaClient = prisma): Promise<PaymentQueryResult> {
    assertFinance(actor);
    if (!input.explanation?.trim()) throw new PaymentQueryError("INVALID", "A rejection explanation is required.");
    return runTransition(db, { actorId: actor.userId, actorType: "TPA_USER", tenantId: actor.tenantId }, id, ["OPEN", "ACKNOWLEDGED", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"], "REJECTED", expectedVersion, { resolutionCode: input.code, resolutionExplanation: input.explanation.trim() }, { eventType: "REJECTED", audience: "SHARED", body: input.explanation.trim(), auditAction: "PAYMENT_QUERY:REJECT", notify: { title: "Payment query closed", body: input.explanation.trim() } });
  },

  // ── reads ──────────────────────────────────────────────────────────────────
  async getForProvider(ctx: ProviderAccessContext, id: string, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, PAYMENT_QUERY_PERMISSION);
    const row = await db.providerPaymentQuery.findFirst({ where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId }, include: { messages: { orderBy: { sequence: "asc" } } } });
    if (!row) return null;
    // version is a concurrency token (not sensitive) — the detail page needs it for the guarded actions.
    return { query: toProviderPaymentQueryProjection(row), version: row.version, timeline: toProviderPaymentQueryTimeline(row.messages) };
  },
  async listForProvider(ctx: ProviderAccessContext, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, PAYMENT_QUERY_PERMISSION);
    const rows = await db.providerPaymentQuery.findMany({ where: { tenantId: ctx.tenantId, providerId: ctx.providerId }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map(toProviderPaymentQueryProjection);
  },

  // ── finance reads (operator; full row incl. internal — the caller gates the role) ──
  async listForFinance(actor: FinanceActor, opts: { status?: PaymentQueryStatus } = {}, db: PrismaClient = prisma) {
    assertFinance(actor);
    return db.providerPaymentQuery.findMany({
      where: { tenantId: actor.tenantId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
  },
  async getForFinance(actor: FinanceActor, id: string, db: PrismaClient = prisma) {
    assertFinance(actor);
    return db.providerPaymentQuery.findFirst({ where: { id, tenantId: actor.tenantId }, include: { messages: { orderBy: { sequence: "asc" } } } });
  },
} as const;

// ── internals ────────────────────────────────────────────────────────────────

function assertFinance(actor: FinanceActor): void {
  if (!PAYMENT_QUERY_FINANCE_ROLES.includes(actor.role)) throw new PaymentQueryError("FORBIDDEN", "Finance role required.");
}

async function assertProviderOwns(db: PrismaClient, ctx: ProviderAccessContext, id: string): Promise<void> {
  const row = await db.providerPaymentQuery.findFirst({ where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true } });
  if (!row) throw new PaymentQueryError("NOT_FOUND", "Payment query not found.");
}

interface TransitionActor { actorId: string; actorType: string; tenantId: string; providerId?: string }

async function runTransition(
  db: PrismaClient,
  actor: TransitionActor,
  id: string,
  from: PaymentQueryStatus[],
  to: PaymentQueryStatus,
  expectedVersion: number,
  data: Prisma.ProviderPaymentQueryUpdateManyMutationInput,
  opts: { eventType: string; audience: "SHARED" | "INTERNAL"; body?: string; auditAction: string; notify?: { title: string; body: string } },
): Promise<PaymentQueryResult> {
  for (const f of from) if (!canTransitionPaymentQuery(f, to)) throw new PaymentQueryError("INVALID_STATE", `Cannot move a ${f.toLowerCase()} query to ${to.toLowerCase()}.`);

  const result = await db.$transaction(async (tx) => {
    const cas = await tx.providerPaymentQuery.updateMany({
      where: { id, tenantId: actor.tenantId, ...(actor.providerId ? { providerId: actor.providerId } : {}), version: expectedVersion, status: { in: from } },
      data: { ...data, status: to, version: { increment: 1 } },
    });
    if (cas.count === 0) {
      const cur = await tx.providerPaymentQuery.findFirst({ where: { id, tenantId: actor.tenantId }, select: { status: true, version: true } });
      if (!cur) throw new PaymentQueryError("NOT_FOUND", "Payment query not found.");
      if (cur.version !== expectedVersion) throw new PaymentQueryError("STALE", "This query changed since you loaded it — refresh and retry.");
      throw new PaymentQueryError("INVALID_STATE", `A ${cur.status.toLowerCase().replace(/_/g, " ")} query cannot take this action.`);
    }
    const fresh = await tx.providerPaymentQuery.findFirst({ where: { id }, select: { version: true, providerId: true, settlementBatchId: true, status: true } });
    await appendMessage(tx, { tenantId: actor.tenantId, paymentQueryId: id, audience: opts.audience, eventType: opts.eventType, newStatus: to, body: opts.body ?? null, actorType: actor.actorType, actorId: actor.actorId });
    return { version: fresh?.version ?? expectedVersion + 1, providerId: fresh?.providerId, settlementBatchId: fresh?.settlementBatchId };
  });

  await auditChainService.append({
    actorId: actor.actorId, action: opts.auditAction, module: "FINANCE",
    entityType: "ProviderPaymentQuery", entityId: id, tenantId: actor.tenantId, payload: { to }, description: `Payment query ${id} → ${to.toLowerCase()}.`,
  });
  if (opts.notify && result.providerId && result.settlementBatchId) {
    await NotificationOutboxService.enqueue({
      tenantId: actor.tenantId, providerId: result.providerId, channel: "IN_APP", eventType: `PAYMENT_QUERY_${to}`, priority: "NORMAL",
      title: opts.notify.title, body: opts.notify.body, href: `/provider/settlements/${result.settlementBatchId}`,
      metadata: { paymentQueryId: id }, dedupeKey: `payment-query-${to}:${id}`,
    }).catch(() => undefined);
  }
  return { id, status: to, version: result.version };
}
