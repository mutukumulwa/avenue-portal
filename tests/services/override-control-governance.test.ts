import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  overrideControl: { findUnique: vi.fn(async (): Promise<any> => null) },
  overrideRecord: { create: vi.fn(async (a: any): Promise<any> => ({ id: "ovr1", ...a.data })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/rbac.service", () => ({ rbacService: { requirePermission: vi.fn(async () => true) } }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));

import { overrideService } from "@/server/services/override.service";

const base = {
  tenantId: "t", makerId: "u1", overrideType: "PAY_ABOVE_CONTRACT_RATE" as const,
  entityType: "ClaimLine", entityId: "cl1", reasonCode: "EXCEPTIONAL_BUSINESS_CASE" as const,
  justification: "This is a sufficiently long justification for the override.",
};

beforeEach(() => vi.clearAllMocks());

describe("override.service OverrideControl governance (spec §9.3)", () => {
  it("blocks a disabled override type", async () => {
    db.overrideControl.findUnique.mockResolvedValue({ allowed: false, justificationMinLength: 20, maxFinancialImpact: null, dualApprovalThreshold: null });
    await expect(overrideService.request(base)).rejects.toThrow(/not permitted/);
  });

  it("blocks justification shorter than the configured minimum", async () => {
    db.overrideControl.findUnique.mockResolvedValue({ allowed: true, justificationMinLength: 100, maxFinancialImpact: null, dualApprovalThreshold: null });
    await expect(overrideService.request(base)).rejects.toThrow(/at least 100/);
  });

  it("blocks a financial impact above the hard cap", async () => {
    db.overrideControl.findUnique.mockResolvedValue({ allowed: true, justificationMinLength: 20, maxFinancialImpact: 50000, dualApprovalThreshold: 100000 });
    await expect(overrideService.request({ ...base, financialImpact: 60000 })).rejects.toThrow(/exceeds the hard cap/);
  });

  it("flags dual approval when impact exceeds the threshold", async () => {
    db.overrideControl.findUnique.mockResolvedValue({ allowed: true, justificationMinLength: 20, maxFinancialImpact: null, dualApprovalThreshold: 100000 });
    await overrideService.request({ ...base, financialImpact: 150000 });
    const created = db.overrideRecord.create.mock.calls[0][0] as any;
    expect(created.data.preState._dualApprovalRequired).toBe(true);
    expect(created.data.preState._financialImpact).toBe(150000);
  });

  it("permits a compliant request (no control configured)", async () => {
    db.overrideControl.findUnique.mockResolvedValue(null);
    const rec = await overrideService.request({ ...base, financialImpact: 10 });
    expect(rec.id).toBe("ovr1");
  });
});
