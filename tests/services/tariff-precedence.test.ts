import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * WP-N2 (N-010) — the shared tariff-precedence order. The pure comparator is the
 * SINGLE order both resolvers use (so they agree on overlap), and the engine's
 * per-line selection is deterministic regardless of the DB row order.
 */

// ── mock prisma for the engine determinism case (engine.test.ts convention) ──
const db = vi.hoisted(() => ({
  providerContract: {
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    findUnique: vi.fn(async (): Promise<unknown> => null),
  },
  providerTariff: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  serviceMappingMemory: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  contractPackage: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  pricingRule: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  providerContractExclusion: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  preauthRule: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  documentationRule: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  externalTariffTable: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { compareTariffPrecedence, compareTariffPrecedenceWithBranch } from "@/server/services/tariff-precedence";
import { ContractEngine } from "@/server/services/contract-engine/engine";
import type { EngineClaimContext } from "@/server/services/contract-engine/types";

const D = (s: string) => new Date(s);

function row(over: Partial<{ id: string; clientId: string | null; contractId: string | null; tariffType: string; effectiveFrom: Date; branchId: string | null }>) {
  return { id: "x", clientId: null, contractId: "c1", tariffType: "NEGOTIATED", effectiveFrom: D("2026-01-01"), branchId: null, ...over };
}

describe("compareTariffPrecedence (pure order)", () => {
  it("client-specific beats network master", () => {
    const winner = [row({ id: "master", clientId: null }), row({ id: "client", clientId: "cli1" })].sort(compareTariffPrecedence)[0];
    expect(winner.id).toBe("client");
  });

  it("contract-scoped beats standalone", () => {
    const winner = [row({ id: "standalone", contractId: null }), row({ id: "contract", contractId: "c1" })].sort(compareTariffPrecedence)[0];
    expect(winner.id).toBe("contract");
  });

  it("tariff-type priority: NEGOTIATED ≺ GAZETTED ≺ PUBLISHED", () => {
    const order = [row({ id: "pub", tariffType: "PUBLISHED" }), row({ id: "gaz", tariffType: "GAZETTED" }), row({ id: "neg", tariffType: "NEGOTIATED" })]
      .sort(compareTariffPrecedence)
      .map((r) => r.id);
    expect(order).toEqual(["neg", "gaz", "pub"]);
  });

  it("latest effectiveFrom wins within the same type", () => {
    const winner = [row({ id: "old", effectiveFrom: D("2026-01-01") }), row({ id: "new", effectiveFrom: D("2026-06-01") })].sort(compareTariffPrecedence)[0];
    expect(winner.id).toBe("new");
  });

  it("is deterministic on a full tie (stable id tie-break, not DB row order)", () => {
    const a = row({ id: "aaa" });
    const b = row({ id: "bbb" });
    expect([a, b].sort(compareTariffPrecedence)[0].id).toBe("aaa");
    expect([b, a].sort(compareTariffPrecedence)[0].id).toBe("aaa"); // reversed input → same winner
  });

  it("branch-specific wins first in the engine variant, then shared order", () => {
    const winner = [
      compareBranchRow({ id: "network", branchId: null }),
      compareBranchRow({ id: "branch", branchId: "b1" }),
    ].sort(compareTariffPrecedenceWithBranch)[0];
    expect(winner.id).toBe("branch");
  });
});

function compareBranchRow(over: Partial<{ id: string; branchId: string | null }>) {
  return row(over);
}

// ── the contract engine picks the SAME deterministic winner on overlap ──
const CONTRACT = {
  id: "con-1", contractNumber: "PC-2026-001", title: "T", status: "ACTIVE", branchScope: "ALL_BRANCHES",
  currentVersionId: "v1", parentContractId: null, balanceBillingPolicy: "PROHIBITED",
  unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null,
  startDate: D("2026-01-01"), endDate: D("2027-01-01"), contractBranches: [], applicability: [],
};

function engineTariff(over: Record<string, unknown>) {
  return {
    id: "t", contractId: "con-1", branchId: null, clientId: null, cptCode: "99213", providerServiceCode: null,
    serviceName: "Consultation", standardDescription: null, providerDescription: null,
    agreedRate: 1000, tariffType: "NEGOTIATED", rateType: "FIXED", rateMissing: false,
    quantityLimit: null, maxQuantityPerVisit: null, discountPct: null, markupPct: null,
    minPayableAmount: null, maxPayableAmount: null, unitOfMeasure: "PER_ITEM", effectiveFrom: D("2026-01-01"),
    ...over,
  };
}

const ctx = (): EngineClaimContext => ({
  tenantId: "t", providerId: "prov1", clientId: null, dateOfService: D("2026-06-15"),
  lines: [{ id: "L1", cptCode: "99213", providerServiceCode: null, description: "Consultation", serviceCategory: null, icdCode: null, quantity: 1, unitCost: 5000, billedAmount: 5000 }],
});

describe("ContractEngine picks the deterministic tariff on overlap (N-010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.providerContract.findMany.mockResolvedValue([CONTRACT]);
    db.providerContract.findUnique.mockResolvedValue(CONTRACT);
  });

  // Two ACTIVE rows for the SAME code overlap the service date: a NEGOTIATED
  // (priority 0) and a later GAZETTED (priority 1). The engine must pick the
  // NEGOTIATED rate (1000) regardless of the order the DB returns them.
  const negotiated = engineTariff({ id: "neg", tariffType: "NEGOTIATED", agreedRate: 1000, effectiveFrom: D("2026-01-01") });
  const gazetted = engineTariff({ id: "gaz", tariffType: "GAZETTED", agreedRate: 2000, effectiveFrom: D("2026-05-01") });

  it("picks NEGOTIATED (1000) when rows arrive [gazetted, negotiated]", async () => {
    db.providerTariff.findMany.mockResolvedValue([gazetted, negotiated]);
    const res = await ContractEngine.evaluateClaim(ctx());
    expect(res.lines[0].contractedAmount).toBe(1000);
    expect(res.lines[0].matchedRuleId).toBe("neg");
  });

  it("picks NEGOTIATED (1000) even when rows arrive [negotiated, gazetted] — order-independent", async () => {
    db.providerTariff.findMany.mockResolvedValue([negotiated, gazetted]);
    const res = await ContractEngine.evaluateClaim(ctx());
    expect(res.lines[0].contractedAmount).toBe(1000);
    expect(res.lines[0].matchedRuleId).toBe("neg");
  });
});
