import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  claim: { aggregate: vi.fn() },
  fxRate: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FxService } from "@/server/services/fx.service";
import { ClientConsolidationService } from "@/server/services/client-consolidation.service";

describe("FxService.gainLoss (G3.5)", () => {
  it("computes a gain when the rate rises", () => {
    // 100 USD booked at 3800, settled at 3900 → +10,000 UGX
    expect(FxService.gainLoss(100, 3800, 3900)).toEqual({ baseAtBooked: 380000, baseAtCurrent: 390000, gainLoss: 10000 });
  });
  it("computes a loss when the rate falls", () => {
    expect(FxService.gainLoss(100, 3900, 3800).gainLoss).toBe(-10000);
  });
});

describe("ClientConsolidationService.consolidateClaims (G3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 1 USD = 3800 UGX; other currencies → identity fallback.
    db.fxRate.findFirst.mockImplementation(async ({ where }: any) =>
      where.quoteCurrency === "USD" ? { rate: 3800 } : null,
    );
  });

  it("rolls a parent + subsidiaries up to the base total", async () => {
    db.client.findMany.mockResolvedValue([
      { id: "parent", name: "Regional", currency: "UGX", parentClientId: null },
      { id: "sub1", name: "Kenya Sub", currency: "UGX", parentClientId: "parent" },
      { id: "sub2", name: "US Sub", currency: "USD", parentClientId: "parent" },
    ]);
    db.claim.aggregate.mockImplementation(async ({ where }: any) => {
      const cid = where.member.group.clientId;
      const sums: Record<string, number> = { parent: 1_000_000, sub1: 500_000, sub2: 100 };
      return { _sum: { billedAmount: sums[cid] ?? 0 } };
    });

    const res = await ClientConsolidationService.consolidateClaims("t1", "parent");
    // parent 1,000,000 UGX + sub1 500,000 UGX + sub2 100 USD × 3800 = 380,000 UGX
    expect(res.baseTotal).toBe(1_880_000);
    expect(res.base).toBe("UGX");
    expect(res.perClient.find((p) => p.clientId === "sub2")?.currency).toBe("USD");
  });
});
