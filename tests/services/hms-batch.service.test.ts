import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn(async (): Promise<{ id: string; name: string; smartProviderId?: string | null } | null> => ({ id: "p1", name: "Aga Khan" })) },
  caseServiceEntry: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => null) },
  clinicalCase: { findFirst: vi.fn(), findMany: vi.fn(async (): Promise<any[]> => []) },
  exceptionLog: { create: vi.fn(async () => ({})) },
}));
const caseSvc = vi.hoisted(() => ({ addServiceEntry: vi.fn(async () => ({ id: "e1" })) }));
const actor = vi.hoisted(() => ({ getSystemActorId: vi.fn(async () => "system") }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/case.service", () => ({ CaseService: caseSvc }));
vi.mock("@/server/services/system-actor.service", () => actor);

import { HmsBatchService, type HmsBatch } from "@/server/services/hms-batch.service";

const batch = (over: Partial<HmsBatch> = {}): HmsBatch => ({
  formatVersion: 1,
  facilityCode: "p1",
  batchRef: "AGA-2026-07-03",
  entries: [
    { caseNumber: "CASE-2026-00001", entryDate: "2026-07-03", description: "Ward fees", unitAmount: 15000 },
    { memberNumber: "MVX-001", entryDate: "2026-07-03", category: "PHARMACY", description: "Drugs", quantity: 2, unitAmount: 5000 },
  ],
  ...over,
});

describe("HmsBatchService.validate (WP-D4 format v1)", () => {
  it("accepts a well-formed batch", () => {
    expect(() => HmsBatchService.validate(batch())).not.toThrow();
  });
  it("rejects unknown format versions", () => {
    expect(() => HmsBatchService.validate({ ...batch(), formatVersion: 2 })).toThrow(/formatVersion/);
  });
  it("rejects entries without a case or member reference", () => {
    expect(() =>
      HmsBatchService.validate(batch({ entries: [{ entryDate: "2026-07-03", description: "X", unitAmount: 1 }] })),
    ).toThrow(/caseNumber or memberNumber/);
  });
  it("rejects negative amounts", () => {
    expect(() =>
      HmsBatchService.validate(batch({ entries: [{ caseNumber: "C", entryDate: "2026-07-03", description: "X", unitAmount: -5 }] })),
    ).toThrow(/unitAmount/);
  });

  // FG-C4: quantity is validated at the envelope so it never poison-throws in apply.
  it("rejects quantity 0, negative, and decimal", () => {
    for (const q of [0, -2, 1.5]) {
      expect(() =>
        HmsBatchService.validate(batch({ entries: [{ caseNumber: "C", entryDate: "2026-07-03", description: "X", unitAmount: 10, quantity: q }] })),
      ).toThrow(/quantity/);
    }
  });
  it("accepts an absent quantity (defaults to 1)", () => {
    expect(() =>
      HmsBatchService.validate(batch({ entries: [{ caseNumber: "C", entryDate: "2026-07-03", description: "X", unitAmount: 10 }] })),
    ).not.toThrow();
  });
});

describe("HmsBatchService.apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.provider.findFirst.mockResolvedValue({ id: "p1", name: "Aga Khan" });
    db.caseServiceEntry.findFirst.mockResolvedValue(null);
    db.clinicalCase.findFirst.mockResolvedValue({ id: "case1" });
    db.clinicalCase.findMany.mockResolvedValue([{ id: "case1" }]);
  });

  it("applies matched entries as HMS_BATCH case service entries", async () => {
    const r = await HmsBatchService.apply("t1", batch());
    expect(r.applied).toBe(2);
    expect(r.unmatched).toBe(0);
    expect(caseSvc.addServiceEntry).toHaveBeenCalledWith(
      expect.objectContaining({ source: "HMS_BATCH", caseId: "case1" }),
    );
  });

  it("is idempotent — a re-posted batch creates nothing new", async () => {
    db.caseServiceEntry.findFirst.mockResolvedValue({ id: "already" });
    const r = await HmsBatchService.apply("t1", batch());
    expect(r.applied).toBe(0);
    expect(r.duplicates).toBe(2);
    expect(caseSvc.addServiceEntry).not.toHaveBeenCalled();
  });

  it("raises exceptions for unmatched entries — never drops them", async () => {
    db.clinicalCase.findFirst.mockResolvedValue(null);
    db.clinicalCase.findMany.mockResolvedValue([]);
    const r = await HmsBatchService.apply("t1", batch());
    expect(r.unmatched).toBe(2);
    expect(db.exceptionLog.create).toHaveBeenCalledTimes(2);
    expect(db.exceptionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "HMS_BATCH_UNMATCHED" }) }),
    );
  });

  it("ambiguous member match (two open cases) is unmatched, not guessed", async () => {
    db.clinicalCase.findMany.mockResolvedValue([{ id: "case1" }, { id: "case2" }]);
    const r = await HmsBatchService.apply("t1", batch({
      entries: [{ memberNumber: "MVX-001", entryDate: "2026-07-03", description: "Drugs", unitAmount: 5000 }],
    }));
    expect(r.unmatched).toBe(1);
    expect(caseSvc.addServiceEntry).not.toHaveBeenCalled();
  });

  it("rejects an unknown facility", async () => {
    db.provider.findFirst.mockResolvedValue(null);
    await expect(HmsBatchService.apply("t1", batch())).rejects.toThrow(/Unknown facility/);
  });
});

describe("HmsBatchService.apply — facility binding (FG-C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.provider.findFirst.mockResolvedValue({ id: "p1", name: "Aga Khan", smartProviderId: null });
    db.caseServiceEntry.findFirst.mockResolvedValue(null);
    db.clinicalCase.findFirst.mockResolvedValue({ id: "case1" });
    db.clinicalCase.findMany.mockResolvedValue([{ id: "case1" }]);
  });

  it("a provider key files for its OWN facility when facilityCode matches (or is absent)", async () => {
    const r = await HmsBatchService.apply("t1", batch({ facilityCode: "p1" }), "p1");
    expect(r.applied).toBe(2);
    // provider resolved by the key's id, not by the payload OR-match
    expect(db.provider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "p1", tenantId: "t1" }) }),
    );
  });

  it("a provider key CANNOT target another facility via payload facilityCode (D2-01)", async () => {
    await expect(
      HmsBatchService.apply("t1", batch({ facilityCode: "p2-other" }), "p1"),
    ).rejects.toThrow(/does not match this facility's API key/);
    expect(caseSvc.addServiceEntry).not.toHaveBeenCalled();
  });

  it("an operator key (no providerFromKey) still resolves the facility from the payload", async () => {
    const r = await HmsBatchService.apply("t1", batch()); // facilityCode "p1", no key provider
    expect(r.applied).toBe(2);
    expect(db.provider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });
});

describe("HmsBatchService.apply — per-line quarantine (FG-C4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.provider.findFirst.mockResolvedValue({ id: "p1", name: "Aga Khan", smartProviderId: null });
    db.caseServiceEntry.findFirst.mockResolvedValue(null);
    db.clinicalCase.findFirst.mockResolvedValue({ id: "case1" });
    db.clinicalCase.findMany.mockResolvedValue([{ id: "case1" }]);
  });

  it("quarantines a line that throws at write; safe lines still apply; batch does not 400", async () => {
    caseSvc.addServiceEntry
      .mockRejectedValueOnce(new Error("Quantity must be at least 1")) // line 1 fails at write
      .mockResolvedValueOnce({ id: "e2" }); //                          line 2 succeeds
    const r = await HmsBatchService.apply("t1", batch());
    expect(r.applied).toBe(1);
    expect(r.rejected).toBe(1);
    expect(r.unmatched).toBe(0);
    // conservation: total = applied + duplicates + unmatched + rejected
    expect(r.total).toBe(r.applied + r.duplicates + r.unmatched + r.rejected);
    expect(db.exceptionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "HMS_BATCH_REJECTED" }) }),
    );
  });
});
