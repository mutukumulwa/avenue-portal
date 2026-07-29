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
import { buildRemittanceCsv, type RemittanceCsvEvidence } from "./csv";

export const REMITTANCE_EXPORT_PERMISSION = "provider.settlement.export";

/**
 * PNOS F6.2/F6.3 — canonical ProviderRemittanceService.
 *
 * The ONE scoped read model that produces a settlement batch's remittance:
 * batch header, voucher, per-claim and per-line frozen amounts, provider-safe
 * reasons, supplemental lineage, and the §8 conservation result. Two entries
 * share ONE assembler (identical projection + arithmetic, F6.3 step 3):
 *
 *   - getBatchRemittance(providerCtx)       → provider-safe model ONLY (F6.2);
 *   - getBatchRemittanceForOperator(scope)  → the SAME provider-safe model PLUS
 *     an admin extension (maker/checker, notes, provider contact, GL journal —
 *     the F6.1 "Safe? = N" fields), for authorized operator surfaces (F6.3).
 *
 * It reads only STORED snapshots (no live tariff/FX/contract recompute, D15),
 * OWNS no settlement/voucher/GL state (never writes, §6.2), and the provider
 * entry excludes every "Safe? = N" field by construction. Provider-facing reads
 * stay gated on the F6.1 §12 finance sign-off (providerRemittanceV2, §11.1).
 */

export const REMITTANCE_PERMISSION = "provider.settlement.read";
// Bounded upper page size — large enough that a full settlement statement (F6.3
// admin detail / F6.4 provider detail) renders every claim in one page for any
// realistic batch, while still capping a runaway query. Batches beyond this show
// an explicit "first N of M" note (no silent truncation).
const MAX_PAGE_SIZE = 1000;
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

/** The F6.1 "Safe? = N" fields — only ever returned by the operator entry. */
export interface RemittanceAdminExtension {
  maker: { id: string; name: string | null } | null;
  checker: { id: string; name: string | null } | null;
  notes: string | null;
  provider: { id: string; name: string; type: string; email: string | null; phone: string | null; address: string | null };
  journalEntry: { entryNumber: string; entryDate: Date; description: string } | null;
}

export interface OperatorBatchRemittance extends BatchRemittance {
  admin: RemittanceAdminExtension;
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

/** Minimal batch shape the assembler + projectBatch consume (both entries select it). */
interface BatchCore {
  id: string;
  cycleMonth: number;
  cycleYear: number;
  sequence: number;
  currency: string;
  baseCurrency: string;
  status: string;
  settledAt: Date | null;
  claimCount: number;
  totalAmount: Prisma.Decimal;
  baseTotalAmount: Prisma.Decimal;
}

const BATCH_CORE_SELECT = {
  id: true, cycleMonth: true, cycleYear: true, sequence: true,
  currency: true, baseCurrency: true, status: true, settledAt: true,
  claimCount: true, totalAmount: true, baseTotalAmount: true,
} as const;

const CLAIM_DETAIL_SELECT = {
  id: true, claimNumber: true, status: true, currency: true, baseCurrency: true,
  serviceType: true, dateOfService: true,
  billedAmount: true, approvedAmount: true, paidAmount: true, memberLiability: true,
  approvedBaseAmount: true, billedBaseAmount: true,
  declineReasonCode: true,
  submissionType: true, chainRootClaimId: true, supersedesClaimId: true, supersededByClaimId: true,
  member: { select: { memberNumber: true, firstName: true, lastName: true } },
  claimLines: {
    orderBy: { lineNumber: "asc" as const },
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
} as const;

/**
 * Shared core: given an already-loaded, already-authorized batch and its scope,
 * project the provider-safe model + conservation. Identical for both entries so
 * the operator/admin view and the provider view can never drift (F6.3 step 3).
 * Returns the raw voucher too (the operator entry reads its journalEntryId).
 */
async function assembleCore(
  db: Db,
  batch: BatchCore,
  scope: { batchId: string; tenantId: string; providerId?: string },
  opts: { page?: number; pageSize?: number },
): Promise<{ voucher: { journalEntryId: string | null } | null; result: BatchRemittance }> {
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(opts.pageSize ?? DEFAULT_PAGE_SIZE)));

  const scopeWhere = { tenantId: scope.tenantId, ...(scope.providerId ? { providerId: scope.providerId } : {}) };
  const claimWhere: Prisma.ClaimWhereInput = { settlementBatchId: scope.batchId, ...scopeWhere };

  const [voucher, claimAgg, lineAgg, totalClaims, claimRows] = await Promise.all([
    db.paymentVoucher.findFirst({
      where: { settlementBatchId: scope.batchId, ...scopeWhere },
      // journalEntryId is selected but ONLY the operator entry surfaces it (projectBatch strips it).
      select: { voucherNumber: true, totalAmount: true, baseTotalAmount: true, status: true, processedAt: true, journalEntryId: true },
      orderBy: { createdAt: "desc" },
    }),
    db.claim.aggregate({ where: claimWhere, _sum: { approvedAmount: true, paidAmount: true, approvedBaseAmount: true } }),
    db.claimLine.aggregate({ where: { claim: claimWhere }, _sum: { approvedAmount: true } }),
    db.claim.count({ where: claimWhere }),
    db.claim.findMany({
      where: claimWhere,
      orderBy: [{ claimNumber: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CLAIM_DETAIL_SELECT,
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
    voucher,
    result: {
      batch: projectBatch(batch, voucher ? { voucherNumber: voucher.voucherNumber, totalAmount: voucher.totalAmount, baseTotalAmount: voucher.baseTotalAmount, status: voucher.status, processedAt: voucher.processedAt } : null),
      conservation,
      claims: claimRows.map((c) => {
        const { claimLines, ...rest } = c;
        return projectClaim({ ...rest, lines: claimLines });
      }),
      page: { page, pageSize, totalClaims, totalPages: Math.max(1, Math.ceil(totalClaims / pageSize)) },
    },
  };
}

export const ProviderRemittanceService = {
  /**
   * Detailed remittance for one settlement batch, scoped to the caller's
   * provider. Non-enumerating: a batch outside the caller's tenant/provider
   * resolves to NOT_FOUND, identical to an absent id (§9.1). Conservation is
   * computed over the FULL batch, so it is invariant across pagination.
   */
  async getBatchRemittance(
    ctx: ProviderAccessContext,
    batchId: string,
    opts: { page?: number; pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<BatchRemittance> {
    ProviderAccessService.requirePermission(ctx, REMITTANCE_PERMISSION);
    const batch = await db.providerSettlementBatch.findFirst({
      where: { id: batchId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: BATCH_CORE_SELECT,
    });
    if (!batch) throw new ProviderRemittanceError("NOT_FOUND", "No such settlement batch");
    const { result } = await assembleCore(db, batch, { batchId, tenantId: ctx.tenantId, providerId: ctx.providerId }, opts);
    return result;
  },

  /**
   * Operator/admin entry (F6.3). Tenant-scoped (an operator views any provider's
   * batch in their tenant — settlement batches are provider-level, not
   * client-level, so there is no client confinement here). Authorization is the
   * CALLER's operator role gate (e.g. requireRole(FINANCE)); this returns null
   * (→ notFound) rather than throwing, since an internal operator is trusted and
   * enumeration is not a concern within their own tenant. Returns the SAME
   * provider-safe model as the provider entry PLUS the admin extension.
   */
  async getBatchRemittanceForOperator(
    scope: { tenantId: string },
    batchId: string,
    opts: { page?: number; pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<OperatorBatchRemittance | null> {
    const batch = await db.providerSettlementBatch.findFirst({
      where: { id: batchId, tenantId: scope.tenantId },
      select: {
        ...BATCH_CORE_SELECT,
        makerId: true, checkerId: true, notes: true,
        provider: { select: { id: true, name: true, type: true, email: true, phone: true, address: true } },
      },
    });
    if (!batch) return null;

    const { voucher, result } = await assembleCore(db, batch, { batchId, tenantId: scope.tenantId }, opts);

    // Admin extension — the F6.1 "Safe? = N" fields, operator-only.
    const actorIds = [batch.makerId, batch.checkerId].filter((x): x is string => !!x);
    const [users, journalEntry] = await Promise.all([
      actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
      voucher?.journalEntryId
        ? db.journalEntry.findUnique({ where: { id: voucher.journalEntryId }, select: { entryNumber: true, entryDate: true, description: true } })
        : Promise.resolve(null),
    ]);
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || null]));

    const admin: RemittanceAdminExtension = {
      maker: batch.makerId ? { id: batch.makerId, name: nameById.get(batch.makerId) ?? null } : null,
      checker: batch.checkerId ? { id: batch.checkerId, name: nameById.get(batch.checkerId) ?? null } : null,
      notes: batch.notes ?? null,
      provider: batch.provider,
      journalEntry: journalEntry ?? null,
    };

    return { ...result, admin };
  },

  /**
   * F6.5 — authorized CSV remittance export, derived from the SAME view model.
   * Requires provider.settlement.export (and, via the reused read, settlement.read).
   * Fetches EVERY claim by paging the read model to exhaustion — pagination never
   * omits a row. Returns the CSV + evidence (row count, totals, sha256 checksum);
   * the caller (route) sets the download headers and audits the egress. Async job
   * / stored-artifact-with-expiry is a deferred scale concern (see the log).
   */
  async exportBatchCsv(
    ctx: ProviderAccessContext,
    batchId: string,
    opts: { pageSize?: number } = {},
    db: Db = prisma,
  ): Promise<{ filename: string; csv: string; evidence: RemittanceCsvEvidence }> {
    ProviderAccessService.requirePermission(ctx, REMITTANCE_EXPORT_PERMISSION);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(opts.pageSize ?? MAX_PAGE_SIZE)));

    // getBatchRemittance also enforces settlement.read + provider scope + NOT_FOUND.
    const first = await ProviderRemittanceService.getBatchRemittance(ctx, batchId, { page: 1, pageSize }, db);
    const claims = [...first.claims];
    let page = 1;
    while (claims.length < first.page.totalClaims) {
      page += 1;
      const next = await ProviderRemittanceService.getBatchRemittance(ctx, batchId, { page, pageSize }, db);
      if (next.claims.length === 0) break; // safety against a shrinking batch mid-read
      claims.push(...next.claims);
    }

    const { csv, evidence } = buildRemittanceCsv({ batch: first.batch, claims, conservation: first.conservation });
    const filename = `remittance-${first.batch.cycleYear}-${String(first.batch.cycleMonth).padStart(2, "0")}-${batchId.slice(0, 8)}.csv`;
    return { filename, csv, evidence };
  },

  /**
   * Provider-scoped settlement list (the read model behind /provider/settlements,
   * F6.4). Batch header + voucher reference + payment status only. Deterministic,
   * newest cycle first.
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
