import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: {
    findUnique: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    count: vi.fn(async () => 0),
  },
  providerTariff: { findFirst: vi.fn(async (): Promise<any> => null) },
  claimFraudAlert: { createMany: vi.fn(async (_a?: unknown) => ({ count: 0 })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FraudService } from "@/server/services/fraud.service";

// CU-OBS-8: dateOfService is date-only (midnight UTC) for wizard/API intakes.
// The +3h EAT shift turned every such claim into "03:00 EAT" and flagged it
// after-hours. The rule must only fire on timestamps with a real clock time.
describe("FraudService.evaluateClaim — RULE-TEMP-003 after-hours (CU-OBS-8)", () => {
  const baseClaim = (dateOfService: Date) => ({
    id: "clm1",
    tenantId: "t1",
    serviceType: "OUTPATIENT",
    currency: "UGX",
    billedAmount: 10_000,
    dateOfService,
    dischargeDate: null,
    memberId: "m1",
    providerId: "p1",
    claimLines: [],
    preauths: [{ id: "pa1" }],
    member: { gender: "FEMALE", claims: [] },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findMany.mockResolvedValue([]);
    db.providerTariff.findFirst.mockResolvedValue(null);
  });

  async function alertsFor(dateOfService: Date) {
    db.claim.findUnique.mockResolvedValue(baseClaim(dateOfService));
    await FraudService.evaluateClaim("clm1", "t1");
    const call = db.claimFraudAlert.createMany.mock.calls[0]?.[0] as
      | { data: Array<{ rule: string }> }
      | undefined;
    return (call?.data ?? []).map((a) => a.rule);
  }

  it("does NOT flag a date-only service date (midnight UTC = the 03:00 EAT sentinel)", async () => {
    const rules = await alertsFor(new Date("2026-07-10"));
    expect(rules).not.toContain("After-Hours Outpatient Anomaly");
  });

  it("flags a real 02:30 EAT clock time (23:30 UTC)", async () => {
    const rules = await alertsFor(new Date("2026-07-09T23:30:00Z"));
    expect(rules).toContain("After-Hours Outpatient Anomaly");
  });

  it("does NOT flag a real daytime clock time (12:00 EAT)", async () => {
    const rules = await alertsFor(new Date("2026-07-10T09:00:00Z"));
    expect(rules).not.toContain("After-Hours Outpatient Anomaly");
  });
});
