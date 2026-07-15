/**
 * OBS-H1: fraud alerts must GATE settlement, not just advise.
 *
 *  - createSettlementBatch: when the tenant requires fraud clearance, a claim
 *    carrying an unresolved alert at/above the threshold is quarantined out of
 *    the scoop; if every eligible claim is flagged, no batch is created.
 *  - markSettlementBatchPaid: a claim flagged AFTER batch creation blocks the
 *    pay-time money moment until the alert is resolved.
 *  - When the setting is OFF (platform default) behaviour is unchanged, so other
 *    tenants are unaffected.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    providerSettlementBatch: {
      findUnique: vi.fn(),
      findMany: vi.fn(async (): Promise<any[]> => []),
      create: vi.fn(async (a: any) => ({ id: "batchNew", ...a.data })),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    claim: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    claimFraudAlert: { findMany: vi.fn(async (): Promise<any[]> => []) },
    tenant: { findUnique: vi.fn(async () => ({ config: null })) },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";
const PROV = "prov1";

// Tenant config that turns the fraud gate ON at MEDIUM threshold. The parser
// reads the settings from `config.claims` (see TenantSettingsService).
const GATE_ON = {
  config: {
    claims: {
      requireFraudClearanceBeforeApproval: true,
      fraudApprovalSeverityThreshold: "MEDIUM",
      fraudApprovalGateMode: "CLEAR_ALERT_OR_DUAL_APPROVAL",
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.providerSettlementBatch.findMany.mockResolvedValue([]); // Run 1
  db.claim.findMany.mockResolvedValue([
    { id: "clean", approvedAmount: 3000, currency: "UGX" },
    { id: "flagged", approvedAmount: 5000, currency: "UGX" },
  ]);
  db.claimFraudAlert.findMany.mockResolvedValue([]);
  db.tenant.findUnique.mockResolvedValue({ config: null });
});

describe("createSettlementBatch — fraud quarantine (OBS-H1)", () => {
  it("quarantines a flagged claim and settles only the clean one", async () => {
    db.tenant.findUnique.mockResolvedValue(GATE_ON);
    db.claimFraudAlert.findMany.mockResolvedValue([{ claimId: "flagged", severity: "HIGH" }]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const created = db.providerSettlementBatch.create.mock.calls[0][0].data;
    expect(created.claimCount).toBe(1);
    expect(Number(created.totalAmount)).toBe(3000);
    // Only the clean claim is stamped into the batch.
    const updated = db.claim.updateMany.mock.calls[0][0].where.id.in;
    expect(updated).toEqual(["clean"]);
    // Audit payload records the quarantined id.
    const audit = db.auditLog.create.mock.calls.at(-1)?.[0]?.data;
    expect(JSON.stringify(audit)).toContain("flagged");
  });

  it("creates no batch when every eligible claim is flagged", async () => {
    db.tenant.findUnique.mockResolvedValue(GATE_ON);
    db.claimFraudAlert.findMany.mockResolvedValue([
      { claimId: "clean", severity: "MEDIUM" },
      { claimId: "flagged", severity: "HIGH" },
    ]);

    await expect(
      claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker"),
    ).rejects.toThrow(/quarantined from settlement/i);
    expect(db.providerSettlementBatch.create).not.toHaveBeenCalled();
  });

  it("does not quarantine an alert below the threshold", async () => {
    db.tenant.findUnique.mockResolvedValue(GATE_ON); // threshold MEDIUM
    db.claimFraudAlert.findMany.mockResolvedValue([{ claimId: "flagged", severity: "LOW" }]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const created = db.providerSettlementBatch.create.mock.calls[0][0].data;
    expect(created.claimCount).toBe(2); // both scooped
  });

  it("scoops all claims when the fraud gate is OFF (default, other tenants unaffected)", async () => {
    // tenant config null → gate off; alerts present but ignored.
    db.claimFraudAlert.findMany.mockResolvedValue([{ claimId: "flagged", severity: "CRITICAL" }]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const created = db.providerSettlementBatch.create.mock.calls[0][0].data;
    expect(created.claimCount).toBe(2);
  });
});

describe("markSettlementBatchPaid — fraud block (OBS-H1)", () => {
  beforeEach(() => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1",
      tenantId: T,
      providerId: PROV,
      status: "CHECKER_APPROVED",
      currency: "UGX",
    });
    db.claim.findMany.mockResolvedValue([
      { id: "c1", approvedAmount: 3000, approvedBaseAmount: 3000, currency: "UGX" },
    ]);
  });

  it("blocks Mark Paid when a claim in the batch was flagged after creation", async () => {
    db.tenant.findUnique.mockResolvedValue(GATE_ON);
    db.claimFraudAlert.findMany.mockResolvedValue([{ claimId: "c1", severity: "HIGH" }]);

    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "user1"),
    ).rejects.toThrow(/Fraud control/i);
  });

  it("passes the fraud gate once the alert is resolved", async () => {
    db.tenant.findUnique.mockResolvedValue(GATE_ON);
    db.claimFraudAlert.findMany.mockResolvedValue([]); // resolved → not returned

    // The full GL posting isn't mocked in this focused suite (settlement-gl
    // covers it); we assert only that the fraud gate is cleared — any error
    // raised downstream must NOT be the fraud-control block.
    let err: Error | null = null;
    try {
      await claimAdjudicationService.markSettlementBatchPaid("batch1", T, "user1");
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").not.toMatch(/Fraud control/i);
  });
});
