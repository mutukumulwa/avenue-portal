import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn(async (): Promise<{ id: string; name: string } | null> => ({ id: "p1", name: "Aga Khan" })) },
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
