/**
 * FG-C5 (WP-B2): point-in-time coverage. `evaluate` answers "was the member
 * covered ON the service date" from MemberCoveragePeriod windows; `openPeriod` /
 * `closeOpenPeriods` maintain that history from the lifecycle transitions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { coverageService, isCoverageEnded } from "@/server/services/coverage.service";

const tx: any = {
  memberCoveragePeriod: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  },
};

const d = (s: string) => new Date(s);
const setPeriods = (periods: Array<{ startDate: string; endDate: string | null }>) =>
  tx.memberCoveragePeriod.findMany.mockResolvedValue(
    periods.map((p) => ({ startDate: d(p.startDate), endDate: p.endDate ? d(p.endDate) : null })),
  );

beforeEach(() => vi.clearAllMocks());

describe("coverageService.evaluate", () => {
  it("reports hasPeriods=false when the member has none (caller falls back to legacy gate)", async () => {
    setPeriods([]);
    expect(await coverageService.evaluate(tx, "m1", d("2026-05-01"))).toEqual({ hasPeriods: false, covered: false });
  });

  it("rejects a date before the window start", async () => {
    setPeriods([{ startDate: "2026-02-01", endDate: null }]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-01-15"))).covered).toBe(false);
  });

  it("accepts a date inside an OPEN window", async () => {
    setPeriods([{ startDate: "2026-02-01", endDate: null }]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-06-15"))).covered).toBe(true);
  });

  it("accepts a date inside a CLOSED window and rejects one after it", async () => {
    setPeriods([{ startDate: "2026-02-01", endDate: "2026-06-30" }]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-05-01"))).covered).toBe(true);
    expect((await coverageService.evaluate(tx, "m1", d("2026-07-01"))).covered).toBe(false);
  });

  it("handles gaps / re-enrolment across multiple periods", async () => {
    setPeriods([
      { startDate: "2026-01-01", endDate: "2026-03-31" },
      { startDate: "2026-06-01", endDate: null },
    ]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-02-15"))).covered).toBe(true); // period 1
    expect((await coverageService.evaluate(tx, "m1", d("2026-04-15"))).covered).toBe(false); // the gap
    expect((await coverageService.evaluate(tx, "m1", d("2026-08-15"))).covered).toBe(true); // period 2
  });

  it("ignoreOpenPeriods: an OPEN window does not count (terminal member fails safe)", async () => {
    setPeriods([{ startDate: "2026-02-01", endDate: null }]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-06-15"), { ignoreOpenPeriods: true })).covered).toBe(false);
    // …but a CLOSED window still confirms an in-window historical claim.
    setPeriods([{ startDate: "2026-02-01", endDate: "2026-06-30" }]);
    expect((await coverageService.evaluate(tx, "m1", d("2026-05-01"), { ignoreOpenPeriods: true })).covered).toBe(true);
  });
});

describe("isCoverageEnded", () => {
  it("classifies terminal statuses as coverage-ended, transient ones as not", () => {
    expect(isCoverageEnded("TERMINATED")).toBe(true);
    expect(isCoverageEnded("TERMINATED_DEATH")).toBe(true);
    expect(isCoverageEnded("EXPIRED")).toBe(true);
    expect(isCoverageEnded("ACTIVE")).toBe(false);
    expect(isCoverageEnded("SUSPENDED")).toBe(false);
    expect(isCoverageEnded("LAPSED")).toBe(false);
  });
});

describe("coverageService.openPeriod", () => {
  it("creates a period when the member has no open one", async () => {
    tx.memberCoveragePeriod.findFirst.mockResolvedValue(null);
    await coverageService.openPeriod(tx, "t1", "m1", d("2026-01-01"), "BINDING");
    expect(tx.memberCoveragePeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", memberId: "m1", reason: "BINDING" }) }),
    );
  });

  it("is idempotent — no-op when an open period already exists", async () => {
    tx.memberCoveragePeriod.findFirst.mockResolvedValue({ id: "cp1" });
    await coverageService.openPeriod(tx, "t1", "m1", d("2026-01-01"), "BINDING");
    expect(tx.memberCoveragePeriod.create).not.toHaveBeenCalled();
  });
});

describe("coverageService.closeOpenPeriods", () => {
  it("closes each open period at endDate", async () => {
    tx.memberCoveragePeriod.findMany.mockResolvedValue([{ id: "cp1", startDate: d("2026-01-01") }]);
    await coverageService.closeOpenPeriods(tx, "m1", d("2026-06-30"), "TERMINATED");
    expect(tx.memberCoveragePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cp1" }, data: expect.objectContaining({ endDate: d("2026-06-30"), reason: "TERMINATED" }) }),
    );
  });

  it("floors a back-dated endDate at the period start (no inverted window)", async () => {
    tx.memberCoveragePeriod.findMany.mockResolvedValue([{ id: "cp1", startDate: d("2026-06-01") }]);
    await coverageService.closeOpenPeriods(tx, "m1", d("2026-01-01"), "TERMINATED");
    expect(tx.memberCoveragePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endDate: d("2026-06-01") }) }),
    );
  });

  it("is a no-op when there is no open period", async () => {
    tx.memberCoveragePeriod.findMany.mockResolvedValue([]);
    await coverageService.closeOpenPeriods(tx, "m1", d("2026-06-30"), "TERMINATED");
    expect(tx.memberCoveragePeriod.update).not.toHaveBeenCalled();
  });
});
