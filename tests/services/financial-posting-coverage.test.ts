/**
 * Outstanding-Conditions Ticket 7 — GL coverage diagnostics.
 *
 * Asserts the coverage helpers correctly flag approved claims and settled
 * batches that lack their journal entries, and report clean when every
 * financial state change is posted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  journalEntry: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
  },
  claim: { findMany: vi.fn(async (): Promise<any[]> => []) },
  providerSettlementBatch: { findMany: vi.fn(async (): Promise<any[]> => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FinancialPostingCoverageService } from "@/server/services/financial-posting-coverage.service";

const T = "t1";

beforeEach(() => vi.clearAllMocks());

describe("findUnpostedApprovedClaims", () => {
  it("flags an approved claim with no CLAIM_APPROVED journal entry", async () => {
    db.claim.findMany.mockResolvedValue([
      { id: "c1", claimNumber: "CLM-1", status: "APPROVED", approvedAmount: 5000, currency: "UGX", decidedAt: new Date() },
      { id: "c2", claimNumber: "CLM-2", status: "PAID", approvedAmount: 8000, currency: "UGX", decidedAt: new Date() },
    ]);
    db.journalEntry.findMany.mockResolvedValue([{ sourceId: "c2" }]); // only c2 posted

    const rows = await FinancialPostingCoverageService.findUnpostedApprovedClaims(T);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c1");
    expect(rows[0].approvedAmount).toBe(5000);
  });

  it("returns empty when every approved claim is posted", async () => {
    db.claim.findMany.mockResolvedValue([
      { id: "c1", claimNumber: "CLM-1", status: "APPROVED", approvedAmount: 5000, currency: "UGX", decidedAt: new Date() },
    ]);
    db.journalEntry.findMany.mockResolvedValue([{ sourceId: "c1" }]);
    expect(await FinancialPostingCoverageService.findUnpostedApprovedClaims(T)).toEqual([]);
  });

  it("short-circuits (no JE query) when there are no candidate claims", async () => {
    db.claim.findMany.mockResolvedValue([]);
    const rows = await FinancialPostingCoverageService.findUnpostedApprovedClaims(T);
    expect(rows).toEqual([]);
    expect(db.journalEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("findSettledBatchesWithoutJournal", () => {
  it("flags a SETTLED batch without a SETTLEMENT_PAID journal entry", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([
      { id: "b1", providerId: "p1", totalAmount: 50000, claimCount: 3, settledAt: new Date() },
      { id: "b2", providerId: "p1", totalAmount: 20000, claimCount: 1, settledAt: new Date() },
    ]);
    db.journalEntry.findMany.mockResolvedValue([{ sourceId: "b1" }]);
    const rows = await FinancialPostingCoverageService.findSettledBatchesWithoutJournal(T);
    expect(rows.map((r) => r.id)).toEqual(["b2"]);
  });
});

describe("assertClaimPosting", () => {
  it("reports posted true/false with the journal id", async () => {
    db.journalEntry.findFirst.mockResolvedValueOnce({ id: "je9" });
    expect(await FinancialPostingCoverageService.assertClaimPosting(T, "c1")).toEqual({
      claimId: "c1",
      posted: true,
      journalEntryId: "je9",
    });
    db.journalEntry.findFirst.mockResolvedValueOnce(null);
    expect(await FinancialPostingCoverageService.assertClaimPosting(T, "c2")).toEqual({
      claimId: "c2",
      posted: false,
      journalEntryId: null,
    });
  });
});

describe("summarise", () => {
  it("aggregates counts and reports clean when nothing is missing", async () => {
    db.claim.findMany.mockResolvedValue([]);
    db.providerSettlementBatch.findMany.mockResolvedValue([]);
    const s = await FinancialPostingCoverageService.summarise(T);
    expect(s.clean).toBe(true);
    expect(s.unpostedClaimCount).toBe(0);
    expect(s.unpostedBatchCount).toBe(0);
  });
});
