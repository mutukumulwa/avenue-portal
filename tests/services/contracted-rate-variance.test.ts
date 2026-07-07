/**
 * OBS-5 — contracted-rate variance must compare like-for-like. A claim mixing
 * a tariffed line with untariffed lines must NOT read as "billed over contract":
 * the previous code summed ALL billed against the contracted total of only the
 * tariffed lines and false-flagged essentially every mixed outpatient claim.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    claim: {
      findUnique: vi.fn(),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    claimFraudAlert: { create: vi.fn(async (a: any) => ({ id: "fa1", ...a.data })) },
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const resolveClaimLineRates = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/provider-contracts.service", () => ({
  ProviderContractsService: { resolveClaimLineRates },
}));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";

function claimWith(lines: Array<{ id: string; billedAmount: number; quantity: number }>) {
  return {
    id: "cl1", tenantId: T, currency: "UGX", providerId: "prov1", dateOfService: new Date("2026-07-07"),
    claimLines: lines.map((l) => ({ ...l, cptCode: "x", description: "x", unitCost: l.billedAmount / l.quantity })),
    provider: { id: "prov1" },
    member: { group: { clientId: "client1" } },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("computeContractedRateVariance (OBS-5)", () => {
  it("does NOT flag a tariffed line billed at contract next to untariffed lines", async () => {
    db.claim.findUnique.mockResolvedValue(
      claimWith([
        { id: "l1", billedAmount: 3500, quantity: 1 }, // consultation, tariffed
        { id: "l2", billedAmount: 8000, quantity: 1 }, // lab, no tariff
        { id: "l3", billedAmount: 5000, quantity: 1 }, // pharmacy, no tariff
      ]),
    );
    resolveClaimLineRates.mockResolvedValue({
      lines: [
        { lineId: "l1", agreedRate: 3500 },
        { lineId: "l2", agreedRate: null },
        { lineId: "l3", agreedRate: null },
      ],
    });

    const res = await claimAdjudicationService.computeContractedRateVariance("cl1", T);

    expect(res?.variancePct).toBe(0);                       // 3500 vs 3500 — not 371%
    expect(res?.billedForContractedLines).toBe(3500);       // untariffed lines excluded
    expect(res?.totalContracted).toBe(3500);
    expect(db.claimFraudAlert.create).not.toHaveBeenCalled();
  });

  it("still flags a genuinely upcoded tariffed line", async () => {
    db.claim.findUnique.mockResolvedValue(
      claimWith([{ id: "l1", billedAmount: 6000, quantity: 1 }]),
    );
    resolveClaimLineRates.mockResolvedValue({ lines: [{ lineId: "l1", agreedRate: 3000 }] });

    const res = await claimAdjudicationService.computeContractedRateVariance("cl1", T);

    expect(res?.variancePct).toBeCloseTo(1.0); // 6000 vs 3000 = 100% over
    expect(db.claimFraudAlert.create).toHaveBeenCalledTimes(1);
  });

  it("returns null (no write, no alert) when no line resolves a contracted rate", async () => {
    db.claim.findUnique.mockResolvedValue(
      claimWith([{ id: "l1", billedAmount: 5000, quantity: 1 }]),
    );
    resolveClaimLineRates.mockResolvedValue({ lines: [{ lineId: "l1", agreedRate: null }] });

    const res = await claimAdjudicationService.computeContractedRateVariance("cl1", T);

    expect(res).toBeNull();
    expect(db.claim.update).not.toHaveBeenCalled();
    expect(db.claimFraudAlert.create).not.toHaveBeenCalled();
  });
});
