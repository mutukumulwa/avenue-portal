import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  fraudRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  fraudInvestigation: {
    create: vi.fn(async (a: any) => ({ id: "inv1", ...a.data })),
    findFirst: vi.fn(async (): Promise<any> => ({ id: "inv1" })),
    update: vi.fn(async (a: any) => ({ id: "inv1", ...a.data })),
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
