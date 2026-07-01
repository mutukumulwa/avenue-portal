import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  fxRate: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FxService, BASE_CURRENCY } from "@/server/services/fx.service";

// Rate table: 1 USD = 3800 UGX, 1 KES = 29 UGX.
const RATES: Record<string, number> = { USD: 3800, KES: 29 };
function mockRates() {
  db.fxRate.findFirst.mockImplementation(async ({ where }: any) => {
    const r = RATES[where.quoteCurrency];
    return r ? { rate: r } : null;
  });
}

describe("FxService (G3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRates();
  });

  it("base currency normalises to itself (identity)", async () => {
    const r = await FxService.normalise("t1", 1000, BASE_CURRENCY);
    expect(r.baseAmount).toBe(1000);
  });

  it("converts a quote currency to base", async () => {
    const r = await FxService.normalise("t1", 10, "USD");
    expect(r.baseAmount).toBe(38000);
  });

  it("falls back to identity when no rate exists (flagged)", async () => {
    const r = await FxService.normalise("t1", 500, "JPY");
    expect(r).toEqual({ baseAmount: 500, rate: 1, identity: true });
  });

  it("consolidates multi-currency amounts to a base total + breakdown", async () => {
    const res = await FxService.consolidate("t1", [
      { amount: 1_000_000, currency: "UGX" },
      { amount: 100, currency: "USD" }, // 380,000 UGX
      { amount: 1000, currency: "KES" }, // 29,000 UGX
      { amount: 50, currency: "USD" }, // +190,000 UGX (same currency grouped)
    ]);
    expect(res.base).toBe("UGX");
    expect(res.baseTotal).toBe(1_000_000 + 380_000 + 190_000 + 29_000);
    // USD amounts grouped: 150 USD → 570,000 base
    const usd = res.byCurrency.find((c) => c.currency === "USD");
    expect(usd).toEqual({ currency: "USD", amount: 150, baseAmount: 570_000 });
  });
});
