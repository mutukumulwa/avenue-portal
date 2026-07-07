import { prisma } from "@/lib/prisma";

/**
 * financial-posting-coverage.service.ts — GL coverage diagnostics
 * (Outstanding-Conditions Ticket 7 / Workstream C).
 *
 * Makes missing GL posting OBSERVABLE. These helpers only REPORT — they never
 * mutate historical data. Any backfill is a separate, finance-approved
 * migration (plan §C6). Fresh UI-created flows are expected to post correctly
 * (a missing GL account fails the financial transition loudly, see GLService);
 * this exists to prove that at scale and to separate historical/imported gaps
 * from live-workflow correctness.
 */

export interface CoverageRange {
  from?: Date;
  to?: Date;
}

export interface UnpostedClaim {
  id: string;
  claimNumber: string;
  status: string;
  approvedAmount: number;
  currency: string;
  decidedAt: Date | null;
}

export interface UnpostedBatch {
  id: string;
  providerId: string;
  totalAmount: number;
  claimCount: number;
  settledAt: Date | null;
}

export interface ClaimPostingResult {
  claimId: string;
  posted: boolean;
  journalEntryId: string | null;
}

const APPROVED_STATES = ["APPROVED", "PARTIALLY_APPROVED", "PAID"] as const;

export class FinancialPostingCoverageService {
  /**
   * Assert a single claim that should be posted actually has its CLAIM_APPROVED
   * journal entry. Returns the result rather than throwing so callers (tests,
   * dashboards) can decide how loud to be.
   */
  static async assertClaimPosting(tenantId: string, claimId: string): Promise<ClaimPostingResult> {
    const je = await prisma.journalEntry.findFirst({
      where: { tenantId, sourceType: "CLAIM_APPROVED", sourceId: claimId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    return { claimId, posted: !!je, journalEntryId: je?.id ?? null };
  }

  /**
   * Approved/partially-approved/paid claims with a payable amount that have NO
   * CLAIM_APPROVED journal entry. Reimbursements are excluded (they post via a
   * different source type). Ordered most-recent first.
   */
  static async findUnpostedApprovedClaims(
    tenantId: string,
    range: CoverageRange = {},
  ): Promise<UnpostedClaim[]> {
    const decidedAt =
      range.from || range.to
        ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
        : undefined;

    const claims = await prisma.claim.findMany({
      where: {
        tenantId,
        isReimbursement: false,
        status: { in: [...APPROVED_STATES] },
        approvedAmount: { gt: 0 },
        ...(decidedAt ? { decidedAt } : {}),
      },
      select: { id: true, claimNumber: true, status: true, approvedAmount: true, currency: true, decidedAt: true },
      orderBy: { decidedAt: "desc" },
    });
    if (claims.length === 0) return [];

    const posted = await prisma.journalEntry.findMany({
      where: {
        tenantId,
        sourceType: "CLAIM_APPROVED",
        sourceId: { in: claims.map((c) => c.id) },
      },
      select: { sourceId: true },
    });
    const postedIds = new Set(posted.map((p) => p.sourceId));

    return claims
      .filter((c) => !postedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        claimNumber: c.claimNumber,
        status: c.status,
        approvedAmount: Number(c.approvedAmount),
        currency: c.currency,
        decidedAt: c.decidedAt,
      }));
  }

  /**
   * SETTLED settlement batches that have NO SETTLEMENT_PAID journal entry — a
   * batch that flipped to SETTLED without its Dr Claims Payable / Cr Bank JE.
   */
  static async findSettledBatchesWithoutJournal(
    tenantId: string,
    range: CoverageRange = {},
  ): Promise<UnpostedBatch[]> {
    const settledAt =
      range.from || range.to
        ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) }
        : undefined;

    const batches = await prisma.providerSettlementBatch.findMany({
      where: { tenantId, status: "SETTLED", ...(settledAt ? { settledAt } : {}) },
      select: { id: true, providerId: true, totalAmount: true, claimCount: true, settledAt: true },
      orderBy: { settledAt: "desc" },
    });
    if (batches.length === 0) return [];

    const posted = await prisma.journalEntry.findMany({
      where: {
        tenantId,
        sourceType: "SETTLEMENT_PAID",
        sourceId: { in: batches.map((b) => b.id) },
      },
      select: { sourceId: true },
    });
    const postedIds = new Set(posted.map((p) => p.sourceId));

    return batches
      .filter((b) => !postedIds.has(b.id))
      .map((b) => ({
        id: b.id,
        providerId: b.providerId,
        totalAmount: Number(b.totalAmount),
        claimCount: b.claimCount,
        settledAt: b.settledAt,
      }));
  }

  /**
   * One-call summary for a diagnostics dashboard / finance reconciliation
   * report. Returns counts + the offending rows for the given window.
   */
  static async summarise(tenantId: string, range: CoverageRange = {}) {
    const [unpostedClaims, unpostedBatches] = await Promise.all([
      this.findUnpostedApprovedClaims(tenantId, range),
      this.findSettledBatchesWithoutJournal(tenantId, range),
    ]);
    return {
      unpostedClaimCount: unpostedClaims.length,
      unpostedBatchCount: unpostedBatches.length,
      unpostedClaims,
      unpostedBatches,
      clean: unpostedClaims.length === 0 && unpostedBatches.length === 0,
    };
  }
}
