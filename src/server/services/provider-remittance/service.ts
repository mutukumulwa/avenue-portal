import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "../provider-access.service";
import {
  computeConservation,
  money,
  projectBatch,
  projectClaim,
  type ConservationResult,
  type RemittanceBatchHeader,
  type RemittanceClaim,
} from "./projection";

/**
 * PNOS F6.2 — canonical ProviderRemittanceService.
 *
 * The ONE scoped read model that produces a settlement batch's remittance:
 * batch header, voucher, per-claim and per-line frozen amounts, provider-safe
 * reasons, supplemental lineage, and the §8 conservation result. It authorizes
 * through the F1.3 ProviderAccessContext, reads only STORED snapshots (no live
 * tariff/FX/contract recompute, D15), and excludes every "Safe? = N" field of
 * the F6.1 dictionary (docs/provider-network-os/REMITTANCE_FIELD_DICTIONARY.md).
 *
 * Boundary (spec §6.2): this OWNS no settlement/voucher/GL state — it never
 * writes. F6.3 layers the authorized admin extension; F6.4 renders the page;
 * F6.7/F6.8 add the missing ProviderDisbursement leg. Stop for F6.2: no page,
 * no export. Downstream provider READS stay gated on the F6.1 §12 finance
 * sign-off (providerRemittanceV2, §11.1) — this service is stage-1 internal
 * evidence and is not wired to a provider page here.
 */

export const REMITTANCE_PERMISSION = "provider.settlement.read";
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export type ProviderRemittanceErrorCode = "NOT_FOUND";

export class ProviderRemittanceError extends Error {
  constructor(public code: ProviderRemittanceErrorCode, message: string) {
    super(message);
    this.name = "ProviderRemittanceError";
  }
}
export function isProviderRemittanceError(e: unknown): e is ProviderRemittanceError {
  return e instanceof ProviderRemittanceError;
}

type Db = PrismaClient | Prisma.TransactionClient;

export interface RemittancePage {
  page: number;
  pageSize: number;
  totalClaims: number;
  totalPages: number;
}

export interface BatchRemittance {
  batch: RemittanceBatchHeader;
  conservation: ConservationResult;
  claims: RemittanceClaim[];
  page: RemittancePage;
}

export interface RemittanceBatchListItem {
  id: string;
  cycleMonth: number;
  cycleYear: number;
  sequence: number;
  currency: string;
  status: string;
  claimCount: number;
  totalAmount: string;
  settledAt: Date | null;
  voucherNumber: string | null;
  paymentStatus: string | null;
}

export const ProviderRemittanceService = {
  /**
   * Detailed remittance for one settlement batch, scoped to the caller's
   * provider. Non-enumerating: a batch outside the caller's tenant/provider
   * resolves to NOT_FOUND, identical to an absent id (§9.1) — a caller cannot
   * probe another provider's batch ids. Conservation is computed over the FULL
   * batch (DB aggregates), so it is invariant across pagination (I5/I6 hold on
   * every page).
   */
  async getBatchRemittance(
    ctx: ProviderAccessContext,
    batchId: string,
    opts: { page?: number; pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<BatchRemittance> {
    // 1. authorize provider/permission (F1.3).
    ProviderAccessService.requirePermission(ctx, REMITTANCE_PERMISSION);

    const page = Math.max(1, Math.trunc(opts.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(opts.pageSize ?? DEFAULT_PAGE_SIZE)));

    // 2. load the frozen batch — provider-scoped, non-enumerating.
    const batch = await db.providerSettlementBatch.findFirst({
      where: { id: batchId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true, cycleMonth: true, cycleYear: true, sequence: true,
        currency: true, baseCurrency: true, status: true, settledAt: true,
        claimCount: true, totalAmount: true, baseTotalAmount: true,
      },
    });
    if (!batch) throw new ProviderRemittanceError("NOT_FOUND", "No such settlement batch");

    // Provider-scoped claim membership — the single WHERE reused for aggregates + page.
    const claimWhere: Prisma.ClaimWhereInput = {
      settlementBatchId: batchId,
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
    };

    const [voucher, claimAgg, lineAgg, totalClaims, claimRows] = await Promise.all([
      // 4. voucher (scalar join; provider-scoped defensively). No journalEntryId.
      db.paymentVoucher.findFirst({
        where: { settlementBatchId: batchId, tenantId: ctx.tenantId, providerId: ctx.providerId },
        select: { voucherNumber: true, totalAmount: true, baseTotalAmount: true, status: true, processedAt: true },
        orderBy: { createdAt: "desc" },
      }),
      // 5. conservation aggregates over the WHOLE batch (invariant across pages).
      db.claim.aggregate({
        where: claimWhere,
        _sum: { approvedAmount: true, paidAmount: true, approvedBaseAmount: true },
      }),
      db.claimLine.aggregate({
        where: { claim: claimWhere },
        _sum: { approvedAmount: true },
      }),
      db.claim.count({ where: claimWhere }),
      // 6. deterministic page of claim/line detail.
      db.claim.findMany({
        where: claimWhere,
        orderBy: [{ claimNumber: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, claimNumber: true, status: true, currency: true, baseCurrency: true,
          serviceType: true, dateOfService: true,
          billedAmount: true, approvedAmount: true, paidAmount: true, memberLiability: true,
          approvedBaseAmount: true, billedBaseAmount: true,
          declineReasonCode: true,
          submissionType: true, chainRootClaimId: true, supersedesClaimId: true, supersededByClaimId: true,
          member: { select: { memberNumber: true, firstName: true, lastName: true } },
          claimLines: {
            orderBy: { lineNumber: "asc" },
            select: {
              id: true, lineNumber: true, description: true, cptCode: true, quantity: true,
              billedAmount: true, contractedAmount: true, disallowedAmount: true,
              memberLiability: true, providerWriteOff: true,
              approvedAmount: true, payerLiability: true,
              // §7 safe reason source — provider-safe fields ONLY (never internalDescription).
              reasonCode: {
                select: { code: true, category: true, providerDescription: true, remedy: true, resubmissionAllowed: true, defaultSeverity: true },
              },
            },
          },
        },
      }),
    ]);

    const conservation = computeConservation({
      currency: batch.currency,
      baseCurrency: batch.baseCurrency,
      status: batch.status,
      batchTotal: batch.totalAmount,
      batchBaseTotal: batch.baseTotalAmount,
      voucher: voucher ? { totalAmount: voucher.totalAmount, baseTotalAmount: voucher.baseTotalAmount } : null,
      sumClaimApproved: claimAgg._sum.approvedAmount,
      sumClaimPaid: claimAgg._sum.paidAmount,
      sumClaimBase: claimAgg._sum.approvedBaseAmount,
      sumLineApproved: lineAgg._sum.approvedAmount,
      disbursementRecorded: false, // D-7
    });

    return {
      batch: projectBatch(batch, voucher),
      conservation,
      claims: claimRows.map((c) => {
        const { claimLines, ...rest } = c;
        return projectClaim({ ...rest, lines: claimLines });
      }),
      page: { page, pageSize, totalClaims, totalPages: Math.max(1, Math.ceil(totalClaims / pageSize)) },
    };
  },

  /**
   * Provider-scoped settlement list (the read model behind /provider/settlements,
   * F6.4). Returns the batch header + voucher reference + payment status only —
   * no internal fields. Ordered deterministically, newest cycle first.
   */
  async listBatches(
    ctx: ProviderAccessContext,
    opts: { page?: number; pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<{ batches: RemittanceBatchListItem[]; page: RemittancePage }> {
    ProviderAccessService.requirePermission(ctx, REMITTANCE_PERMISSION);
    const page = Math.max(1, Math.trunc(opts.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(opts.pageSize ?? DEFAULT_PAGE_SIZE)));
    const where: Prisma.ProviderSettlementBatchWhereInput = { tenantId: ctx.tenantId, providerId: ctx.providerId };

    const [totalClaims, rows] = await Promise.all([
      db.providerSettlementBatch.count({ where }),
      db.providerSettlementBatch.findMany({
        where,
        orderBy: [{ cycleYear: "desc" }, { cycleMonth: "desc" }, { sequence: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, cycleMonth: true, cycleYear: true, sequence: true,
          currency: true, status: true, claimCount: true, totalAmount: true, settledAt: true,
        },
      }),
    ]);

    // one voucher lookup for the page's batches (scalar link; provider-scoped).
    const vouchers = await db.paymentVoucher.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, settlementBatchId: { in: rows.map((r) => r.id) } },
      select: { settlementBatchId: true, voucherNumber: true, status: true },
    });
    const voucherByBatch = new Map(
      vouchers.filter((v) => v.settlementBatchId).map((v) => [v.settlementBatchId as string, v]),
    );

    return {
      batches: rows.map((b) => {
        const v = voucherByBatch.get(b.id);
        return {
          id: b.id,
          cycleMonth: b.cycleMonth,
          cycleYear: b.cycleYear,
          sequence: b.sequence,
          currency: b.currency,
          status: b.status,
          claimCount: b.claimCount,
          totalAmount: money(b.totalAmount),
          settledAt: b.settledAt,
          voucherNumber: v?.voucherNumber ?? null,
          paymentStatus: v?.status ?? null,
        };
      }),
      page: { page, pageSize, totalClaims, totalPages: Math.max(1, Math.ceil(totalClaims / pageSize)) },
    };
  },
} as const;
