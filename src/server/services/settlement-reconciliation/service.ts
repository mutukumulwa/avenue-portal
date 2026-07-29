import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient, type ReconciliationInvestigationStatus } from "@prisma/client";
import { auditChainService } from "@/server/services/audit-chain.service";
import { classifyBatchReconciliation, type BatchReconResult } from "./classify";

/**
 * PNOS F6.9 — settlement reconciliation control (job + read model).
 *
 * A scheduled/operator job that INDEPENDENTLY recomputes the I5 chain per SETTLED
 * batch from raw aggregates (not the read model) and stores each run + watermark +
 * the exact mismatches for finance. It NEVER mutates a financial fact (spec step 6);
 * the only writes are its own run/exception rows and the human investigation status.
 */

const RECON_FINANCE_ROLES = ["SUPER_ADMIN", "FINANCE_OFFICER"];

export type ReconInvestigationErrorCode = "FORBIDDEN" | "NOT_FOUND";
export class ReconInvestigationError extends Error {
  constructor(public code: ReconInvestigationErrorCode, message: string) {
    super(message);
    this.name = "ReconInvestigationError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

export interface ReconActor {
  userId: string;
  tenantId: string;
  role: string;
}

export const SettlementReconciliationService = {
  /**
   * Independently reconcile ONE batch — raw aggregates → classifier. Read-only.
   * Returns null if the batch is not found in the tenant.
   */
  async reconcileBatch(tenantId: string, batchId: string, db: Db = prisma): Promise<BatchReconResult | null> {
    const batch = await db.providerSettlementBatch.findFirst({
      where: { id: batchId, tenantId },
      select: { id: true, currency: true, baseCurrency: true, totalAmount: true, baseTotalAmount: true },
    });
    if (!batch) return null;

    const claimWhere: Prisma.ClaimWhereInput = { settlementBatchId: batchId, tenantId };
    const [voucher, claimAgg, lineAgg, disbAgg] = await Promise.all([
      db.paymentVoucher.findFirst({ where: { settlementBatchId: batchId, tenantId }, select: { totalAmount: true }, orderBy: { createdAt: "desc" } }),
      db.claim.aggregate({ where: claimWhere, _sum: { approvedAmount: true, approvedBaseAmount: true } }),
      db.claimLine.aggregate({ where: { claim: claimWhere }, _sum: { approvedAmount: true } }),
      db.providerDisbursement.aggregate({ where: { tenantId, settlementBatchId: batchId, status: "SUCCEEDED" }, _sum: { amount: true } }),
    ]);

    return classifyBatchReconciliation({
      batchId: batch.id,
      currency: batch.currency,
      baseCurrency: batch.baseCurrency,
      hasVoucher: voucher != null,
      batchTotal: batch.totalAmount,
      batchBaseTotal: batch.baseTotalAmount,
      voucherTotal: voucher?.totalAmount ?? null,
      sumClaimApproved: claimAgg._sum.approvedAmount,
      sumClaimBase: claimAgg._sum.approvedBaseAmount,
      sumLineApproved: lineAgg._sum.approvedAmount,
      sumSuccessfulDisbursement: disbAgg._sum.amount,
    });
  },

  /**
   * Sweep SETTLED batches (optionally only those settled after a prior watermark),
   * reconcile each, and STORE a run + its exceptions + the new watermark. Idempotent
   * within a run (each batch classified once). Never mutates a financial fact.
   */
  async runReconciliation(
    tenantId: string,
    opts: { since?: Date; limit?: number } = {},
    db: PrismaClient = prisma,
  ): Promise<{ runId: string; batchesChecked: number; exceptionsFound: number; watermark: Date | null }> {
    const run = await db.settlementReconciliationRun.create({ data: { tenantId, status: "RUNNING" } });

    const batches = await db.providerSettlementBatch.findMany({
      where: { tenantId, status: "SETTLED", ...(opts.since ? { settledAt: { gt: opts.since } } : {}) },
      orderBy: { settledAt: "asc" },
      take: opts.limit ?? 1000,
      select: { id: true, providerId: true, currency: true, settledAt: true },
    });

    let exceptionsFound = 0;
    let watermark: Date | null = opts.since ?? null;
    for (const b of batches) {
      const result = await SettlementReconciliationService.reconcileBatch(tenantId, b.id, db);
      if (b.settledAt && (!watermark || b.settledAt > watermark)) watermark = b.settledAt;
      if (!result || result.reconciled) continue;
      for (const ex of result.exceptions) {
        exceptionsFound += 1;
        await db.settlementReconciliationException.create({
          data: {
            tenantId, runId: run.id, settlementBatchId: b.id, providerId: b.providerId, currency: b.currency,
            type: ex.type, detail: ex.detail,
            expectedAmount: new Prisma.Decimal(ex.expected), actualAmount: new Prisma.Decimal(ex.actual),
          },
        });
      }
    }

    await db.settlementReconciliationRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), watermark, batchesChecked: batches.length, exceptionsFound, status: "COMPLETED" },
    });

    return { runId: run.id, batchesChecked: batches.length, exceptionsFound, watermark };
  },

  /** Update the investigation status of an exception (finance). NEVER touches money. */
  async updateInvestigation(
    actor: ReconActor,
    exceptionId: string,
    input: { status: ReconciliationInvestigationStatus; note?: string },
    db: PrismaClient = prisma,
  ): Promise<{ id: string; investigationStatus: ReconciliationInvestigationStatus }> {
    if (!RECON_FINANCE_ROLES.includes(actor.role)) throw new ReconInvestigationError("FORBIDDEN", "Finance role required.");
    const existing = await db.settlementReconciliationException.findFirst({ where: { id: exceptionId, tenantId: actor.tenantId }, select: { id: true } });
    if (!existing) throw new ReconInvestigationError("NOT_FOUND", "Reconciliation exception not found.");

    const terminal = input.status === "RESOLVED" || input.status === "ACCEPTED";
    const row = await db.settlementReconciliationException.update({
      where: { id: exceptionId },
      data: {
        investigationStatus: input.status,
        ...(input.note !== undefined ? { investigationNote: input.note } : {}),
        ...(terminal ? { resolvedById: actor.userId, resolvedAt: new Date() } : { resolvedById: null, resolvedAt: null }),
      },
      select: { id: true, investigationStatus: true },
    });
    await auditChainService.append({
      actorId: actor.userId, action: "RECONCILIATION:INVESTIGATE", module: "FINANCE",
      entityType: "SettlementReconciliationException", entityId: exceptionId, tenantId: actor.tenantId,
      payload: { status: input.status }, description: `Reconciliation exception ${exceptionId} → ${input.status.toLowerCase()}.`,
    });
    return row;
  },

  /** Latest run for the tenant (dashboard header). */
  async latestRun(tenantId: string, db: Db = prisma) {
    return db.settlementReconciliationRun.findFirst({ where: { tenantId }, orderBy: { startedAt: "desc" } });
  },

  /** Open (or filtered) exceptions for the dashboard. */
  async listExceptions(tenantId: string, opts: { status?: ReconciliationInvestigationStatus; runId?: string; limit?: number } = {}, db: Db = prisma) {
    return db.settlementReconciliationException.findMany({
      where: { tenantId, ...(opts.status ? { investigationStatus: opts.status } : {}), ...(opts.runId ? { runId: opts.runId } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 200,
    });
  },
} as const;
