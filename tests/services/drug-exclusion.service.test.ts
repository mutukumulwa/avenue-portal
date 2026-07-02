import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  drugExclusion: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claim: { findUnique: vi.fn(async (): Promise<any> => null) },
  claimLine: { update: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { DrugExclusionService } from "@/server/services/drug-exclusion.service";

describe("DrugExclusionService (G9.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a normalised excluded-code set", async () => {
    db.drugExclusion.findMany.mockResolvedValue([{ drugCode: "n02be01" }, { drugCode: "A10BA02" }]);
    const set = await DrugExclusionService.getExcludedCodes("t1", { clientId: "c1" });
    expect(set.has("N02BE01")).toBe(true);
    expect(set.has("A10BA02")).toBe(true);
  });

  it("isExcluded is case-insensitive and null-safe", () => {
    const set = new Set(["N02BE01"]);
    expect(DrugExclusionService.isExcluded("n02be01", set)).toBe(true);
    expect(DrugExclusionService.isExcluded("X99", set)).toBe(false);
    expect(DrugExclusionService.isExcluded(null, set)).toBe(false);
  });

  it("partitions claim lines into excluded vs payable", () => {
    const set = new Set(["N02BE01"]);
    const lines = [
      { drugCode: "N02BE01", id: "l1" },
      { drugCode: "A10BA02", id: "l2" },
      { drugCode: null, id: "l3" },
    ];
    const { excluded, payable } = DrugExclusionService.partitionLines(lines, set);
    expect(excluded.map((l) => l.id)).toEqual(["l1"]);
    expect(payable.map((l) => l.id)).toEqual(["l2", "l3"]);
  });
});

describe("DrugExclusionService.applyToClaim — intake enforcement (G9.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue({
      dateOfService: new Date("2026-06-01"),
      claimLines: [
        { id: "l1", drugCode: "N02BE01", billedAmount: 20000, adjudicationDecision: null },
        { id: "l2", drugCode: "A10BA02", billedAmount: 30000, adjudicationDecision: null },
        { id: "l3", drugCode: null, billedAmount: 50000, adjudicationDecision: null },
      ],
      member: { packageId: "pkg1", group: { clientId: "c1" } },
    });
    db.drugExclusion.findMany.mockResolvedValue([{ drugCode: "N02BE01" }]);
  });

  it("DECLINEs excluded lines with the reason and returns the payable net", async () => {
    const r = await DrugExclusionService.applyToClaim("t1", "clm1");
    expect(r.excludedCount).toBe(1);
    expect(r.excludedAmount).toBe(20000);
    expect(r.payableAmount).toBe(80000);
    expect(db.claimLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({ adjudicationDecision: "DECLINED", approvedAmount: 0 }),
      }),
    );
  });

  it("is idempotent — already-declined excluded lines are not re-written", async () => {
    db.claim.findUnique.mockResolvedValue({
      dateOfService: new Date("2026-06-01"),
      claimLines: [{ id: "l1", drugCode: "N02BE01", billedAmount: 20000, adjudicationDecision: "DECLINED" }],
      member: { packageId: "pkg1", group: { clientId: "c1" } },
    });
    const r = await DrugExclusionService.applyToClaim("t1", "clm1");
    expect(r.excludedCount).toBe(1);
    expect(db.claimLine.update).not.toHaveBeenCalled();
  });

  it("no exclusions configured → nothing declined, full amount payable", async () => {
    db.drugExclusion.findMany.mockResolvedValue([]);
    const r = await DrugExclusionService.applyToClaim("t1", "clm1");
    expect(r.excludedCount).toBe(0);
    expect(r.payableAmount).toBe(100000);
    expect(db.claimLine.update).not.toHaveBeenCalled();
  });
});
