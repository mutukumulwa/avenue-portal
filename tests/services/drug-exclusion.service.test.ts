import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ drugExclusion: { findMany: vi.fn(async (): Promise<any[]> => []) } }));
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
