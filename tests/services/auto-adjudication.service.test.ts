import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn() },
  autoAdjudicationPolicy: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claimFraudAlert: { count: vi.fn(async () => 0) },
}));
const gate = vi.hoisted(() => ({ runHardGateValidation: vi.fn(async () => ({ passed: true, errors: [] as string[] })) }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/claim-adjudication.service", () => ({ claimAdjudicationService: gate }));

import { AutoAdjudicationService } from "@/server/services/auto-adjudication.service";

const claim = (over: any = {}) => ({
  providerId: "p1", memberId: "m1", dateOfService: new Date("2026-06-01"),
  benefitCategory: "OUTPATIENT", invoiceNumber: "INV-1", billedAmount: 50000,
  member: { group: { clientId: "c1" } }, ...over,
});

describe("AutoAdjudicationService.evaluateClaim (G3.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(claim());
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([]);
    db.claimFraudAlert.count.mockResolvedValue(0);
    gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
  });

  it("AUTO_APPROVEs a clean claim under the default policy", async () => {
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("AUTO_APPROVE");
  });

  it("ROUTEs with the failing gate named when a hard gate fails", async () => {
    gate.runHardGateValidation.mockResolvedValue({ passed: false, errors: ["Double-capture: ..."] });
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toMatch(/Double-capture/);
  });

  it("ROUTEs when an open fraud flag exists", async () => {
    db.claimFraudAlert.count.mockResolvedValue(2);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("FRAUD_FLAG");
  });

  it("ROUTEs when billed exceeds the client's auto-approve ceiling", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 500000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "pol1", clientId: "c1", enabled: true, maxAutoApproveAmount: 100000, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("ABOVE_CEILING");
    expect(r.policyId).toBe("pol1");
  });

  it("ROUTEs when the policy is disabled", async () => {
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "pol2", clientId: "c1", enabled: false, maxAutoApproveAmount: null, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("AUTO_ADJ_DISABLED");
  });

  it("prefers a client-specific policy over the operator default", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 200000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "op", clientId: null, enabled: true, maxAutoApproveAmount: null, requireCleanFraud: true, effectiveFrom: new Date() },
      { id: "cl", clientId: "c1", enabled: true, maxAutoApproveAmount: 100000, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    // The client policy's ceiling (100k) applies → routes; proves client wins.
    expect(r.policyId).toBe("cl");
    expect(r.decision).toBe("ROUTE");
  });
});
