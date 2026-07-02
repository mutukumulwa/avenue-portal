import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  fraudRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  fraudInvestigation: {
    create: vi.fn(async (a: any) => ({ id: "inv1", ...a.data })),
    findFirst: vi.fn(async (): Promise<any> => ({ id: "inv1" })),
    update: vi.fn(async (a: any) => ({ id: "inv1", ...a.data })),
  },
  claim: { findMany: vi.fn(async (): Promise<any[]> => []), count: vi.fn(async () => 0) },
  claimFraudAlert: {
    findFirst: vi.fn(async (): Promise<any> => null),
    create: vi.fn(async (a: any) => ({ id: "fa1", ...a.data })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FraudEngineService, FraudInvestigationService } from "@/server/services/fraud-engine.service";

describe("FraudEngineService.getActiveRules (G5.11)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a client-specific rule overrides the operator default of the same code", async () => {
    db.fraudRule.findMany.mockResolvedValue([
      { id: "op", clientId: null, code: "UPCODING", weight: 1 },
      { id: "cl", clientId: "c1", code: "UPCODING", weight: 5 },
      { id: "op2", clientId: null, code: "PHANTOM_BILLING", weight: 3 },
    ]);
    const rules = await FraudEngineService.getActiveRules("t1", "c1");
    const upcoding = rules.find((r) => r.code === "UPCODING");
    expect(upcoding?.id).toBe("cl");
    expect(rules).toHaveLength(2); // deduped by code
  });
});

describe("FraudEngineService.scanRecentClaims — configurable scan (G5.11)", () => {
  const scanClaim = (over: any = {}) => ({
    id: "clm1",
    memberId: "m1",
    providerId: "p1",
    dateOfService: new Date("2026-06-30"),
    contractedVariancePct: null,
    member: { group: { clientId: "c1" } },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.claimFraudAlert.findFirst.mockResolvedValue(null);
  });

  it("UPCODING fires from the claim's contracted variance vs the rule threshold", async () => {
    db.claim.findMany.mockResolvedValue([scanClaim({ contractedVariancePct: 0.35 })]);
    db.fraudRule.findMany.mockResolvedValue([
      { id: "r1", clientId: "c1", code: "UPCODING", name: "Upcoding", weight: 5, config: { variancePct: 20 } },
    ]);
    const r = await FraudEngineService.scanRecentClaims("t1");
    expect(r.alertsCreated).toBe(1);
    expect(db.claimFraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rule: "UPCODING", severity: "HIGH", claimId: "clm1" }),
      }),
    );
  });

  it("HIGH_FREQUENCY fires when the member's claim velocity exceeds the configured max", async () => {
    db.claim.findMany.mockResolvedValueOnce([scanClaim()]);
    db.fraudRule.findMany.mockResolvedValue([
      { id: "r2", clientId: null, code: "HIGH_FREQUENCY", name: "High frequency", weight: 3, config: { maxClaims: 5, windowDays: 30 } },
    ]);
    db.claim.count.mockResolvedValue(9);
    const r = await FraudEngineService.scanRecentClaims("t1");
    expect(r.alertsCreated).toBe(1);
    expect(db.claimFraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rule: "HIGH_FREQUENCY", severity: "MEDIUM" }) }),
    );
  });

  it("is idempotent — an existing alert for the (claim, rule) is not duplicated", async () => {
    db.claim.findMany.mockResolvedValue([scanClaim({ contractedVariancePct: 0.35 })]);
    db.fraudRule.findMany.mockResolvedValue([
      { id: "r1", clientId: "c1", code: "UPCODING", name: "Upcoding", weight: 5, config: { variancePct: 20 } },
    ]);
    db.claimFraudAlert.findFirst.mockResolvedValue({ id: "existing" });
    const r = await FraudEngineService.scanRecentClaims("t1");
    expect(r.alertsCreated).toBe(0);
    expect(db.claimFraudAlert.create).not.toHaveBeenCalled();
  });

  it("below-threshold claims raise nothing; unknown codes are ignored", async () => {
    db.claim.findMany.mockResolvedValue([scanClaim({ contractedVariancePct: 0.05 })]);
    db.fraudRule.findMany.mockResolvedValue([
      { id: "r1", clientId: "c1", code: "UPCODING", name: "Upcoding", weight: 5, config: { variancePct: 20 } },
      { id: "rX", clientId: "c1", code: "AI_FORGERY", name: "Future evaluator", weight: 5, config: {} },
    ]);
    const r = await FraudEngineService.scanRecentClaims("t1");
    expect(r.scanned).toBe(1);
    expect(r.alertsCreated).toBe(0);
  });
});

describe("FraudInvestigationService (G5.11)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens an investigation over a claim/alert", async () => {
    const inv: any = await FraudInvestigationService.open("t1", { claimId: "clm1", fraudAlertId: "fa1" });
    expect(inv.status).toBe("OPEN");
    expect(inv.claimId).toBe("clm1");
  });

  it("assign moves it to IN_PROGRESS with an assignee", async () => {
    await FraudInvestigationService.assign("t1", "inv1", "u1");
    expect(db.fraudInvestigation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: "u1", status: "IN_PROGRESS" } }),
    );
  });

  it("resolve closes it SUBSTANTIATED with findings + a closedAt", async () => {
    await FraudInvestigationService.resolve("t1", "inv1", "SUBSTANTIATED", { findings: "phantom", outcome: "recover" });
    expect(db.fraudInvestigation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBSTANTIATED", closedAt: expect.any(Date) }) }),
    );
  });
});
