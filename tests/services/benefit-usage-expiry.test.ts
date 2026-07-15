/**
 * FG-C10 (WP-B1): benefit-hold expiry must be reflected LIVE in availableLimit,
 * not only when the worker releases expired holds — otherwise a down/lagging
 * worker leaves activeHoldAmount inflated → members over-reserved → claims wrongly
 * declined "insufficient balance".
 *
 * HARD SAFETY INVARIANT: the live computation may only *free* already-expired
 * benefit; it must NEVER under-reserve (yield more available than the true active
 * obligation), which would enable overspend. These tests pin that both ways:
 *  - a non-expired ACTIVE hold always counts;
 *  - only expired ACTIVE holds free;
 *  - with nothing expired, available never exceeds limit − used − storedHeld;
 *  - if stored drifted BELOW the live active holds, held floors UP to them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BenefitUsageService } from "@/server/services/benefit-usage.service";

const FUTURE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // well after now → active
const PAST = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // well before now → expired

const tx: any = {
  member: { findUnique: vi.fn() },
  benefitConfig: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
  benefitUsage: { findUnique: vi.fn() },
  benefitHold: { findMany: vi.fn(async () => []) },
  benefitConfigSharedLimit: { findMany: vi.fn(async () => []) },
};

const setStored = (amountUsed: number, activeHoldAmount: number) =>
  tx.benefitUsage.findUnique.mockResolvedValue({ amountUsed, activeHoldAmount });
const setHolds = (holds: Array<{ heldAmount: number; expiresAt: Date; status?: string }>) =>
  tx.benefitHold.findMany.mockResolvedValue(holds.map((h) => ({ status: "ACTIVE", ...h })));

beforeEach(() => {
  vi.clearAllMocks();
  // limit 100_000, member enrolled 2026-01-01, config resolves for the category.
  tx.member.findUnique.mockResolvedValue({ packageVersionId: "pv1", enrollmentDate: new Date("2026-01-01") });
  tx.benefitConfig.findFirst.mockResolvedValue({ id: "cfg1", annualSubLimit: 100_000 });
  tx.benefitHold.findMany.mockResolvedValue([]);
});

const available = () => BenefitUsageService.availableLimit(tx, "m1", "OUTPATIENT");

describe("availableLimit — live hold-expiry reconciliation (FG-C10)", () => {
  it("a non-expired ACTIVE hold still counts (held unchanged, no phantom freeing)", async () => {
    setStored(20_000, 30_000);
    setHolds([{ heldAmount: 30_000, expiresAt: FUTURE }]);
    const r = await available();
    expect(r!.held).toBe(30_000);
    expect(r!.available).toBe(50_000); // 100k − 20k used − 30k held
    // scoped to ACTIVE holds for the member+category
    expect(tx.benefitHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: "m1", status: "ACTIVE", benefitCategory: { in: ["OUTPATIENT"] } }),
      }),
    );
  });

  it("an expired ACTIVE hold frees — available rises by exactly the expired amount", async () => {
    setStored(20_000, 30_000);
    setHolds([{ heldAmount: 30_000, expiresAt: PAST }]);
    const r = await available();
    expect(r!.held).toBe(0);
    expect(r!.available).toBe(80_000); // the stale 30k hold is released live
  });

  it("frees only the expired portion of a mixed set", async () => {
    setStored(20_000, 30_000);
    setHolds([
      { heldAmount: 20_000, expiresAt: FUTURE }, // still active — keep
      { heldAmount: 10_000, expiresAt: PAST },    // expired — free
    ]);
    const r = await available();
    expect(r!.held).toBe(20_000); // 30k stored − 10k expired
    expect(r!.available).toBe(60_000);
  });

  it("with NOTHING expired, available never exceeds limit − used − storedHeld (fails safe)", async () => {
    setStored(20_000, 30_000);
    setHolds([
      { heldAmount: 18_000, expiresAt: FUTURE },
      { heldAmount: 12_000, expiresAt: FUTURE },
    ]);
    const r = await available();
    const oldAvailable = Math.max(0, 100_000 - 20_000 - 30_000);
    expect(r!.available).toBeLessThanOrEqual(oldAvailable);
    expect(r!.held).toBe(30_000); // unchanged
  });

  it("NEVER under-reserves: if stored drifted below the live active holds, held floors UP to them", async () => {
    setStored(20_000, 5_000); // books say only 5k held …
    setHolds([{ heldAmount: 30_000, expiresAt: FUTURE }]); // … but 30k is genuinely on active hold
    const r = await available();
    expect(r!.held).toBe(30_000); // reserve the true obligation, not the stale-low 5k
    expect(r!.available).toBe(50_000); // NOT 75k — overspend is not enabled
  });

  it("no active holds → held is zero, available = limit − used", async () => {
    setStored(20_000, 0);
    setHolds([]);
    const r = await available();
    expect(r!.held).toBe(0);
    expect(r!.available).toBe(80_000);
  });
});
