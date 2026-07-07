/**
 * Outstanding-Conditions Ticket 1 — tenant claim-control settings.
 *
 * Asserts default-when-absent resolution, malformed-config safety, the
 * severity ranking used by the fraud gate, and that an update merges into
 * (never clobbers) the rest of Tenant.config and writes an audit row.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), update: vi.fn(async (a: any) => a) },
  auditLog: { create: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  TenantSettingsService,
  CLAIM_CONTROL_DEFAULTS,
} from "@/server/services/tenant-settings.service";

beforeEach(() => vi.clearAllMocks());

describe("parseClaimControls — defaults & safety", () => {
  it("empty config resolves to the safe defaults (gate OFF)", () => {
    expect(TenantSettingsService.parseClaimControls({})).toEqual(CLAIM_CONTROL_DEFAULTS);
    expect(TenantSettingsService.parseClaimControls(null)).toEqual(CLAIM_CONTROL_DEFAULTS);
    expect(TenantSettingsService.parseClaimControls(undefined)).toEqual(CLAIM_CONTROL_DEFAULTS);
  });

  it("malformed values fall back per-key without throwing", () => {
    const parsed = TenantSettingsService.parseClaimControls({
      claims: {
        requireFraudClearanceBeforeApproval: "yes", // wrong type → default false
        fraudApprovalSeverityThreshold: "SEVERE", // invalid → default MEDIUM
        fraudApprovalGateMode: 42, // wrong type → default
      },
    });
    expect(parsed).toEqual(CLAIM_CONTROL_DEFAULTS);
  });

  it("valid values are honoured", () => {
    const parsed = TenantSettingsService.parseClaimControls({
      claims: {
        requireFraudClearanceBeforeApproval: true,
        fraudApprovalSeverityThreshold: "HIGH",
        fraudApprovalGateMode: "CLEAR_ALERT_ONLY",
      },
    });
    expect(parsed).toEqual({
      requireFraudClearanceBeforeApproval: true,
      fraudApprovalSeverityThreshold: "HIGH",
      fraudApprovalGateMode: "CLEAR_ALERT_ONLY",
    });
  });
});

describe("severityAtLeast", () => {
  it("ranks LOW < MEDIUM < HIGH < CRITICAL", () => {
    expect(TenantSettingsService.severityAtLeast("MEDIUM", "MEDIUM")).toBe(true);
    expect(TenantSettingsService.severityAtLeast("HIGH", "MEDIUM")).toBe(true);
    expect(TenantSettingsService.severityAtLeast("CRITICAL", "HIGH")).toBe(true);
    expect(TenantSettingsService.severityAtLeast("LOW", "MEDIUM")).toBe(false);
    expect(TenantSettingsService.severityAtLeast("MEDIUM", "HIGH")).toBe(false);
  });
});

describe("getClaimControls", () => {
  it("reads Tenant.config and applies defaults", async () => {
    db.tenant.findUnique.mockResolvedValue({
      config: { claims: { requireFraudClearanceBeforeApproval: true } },
    });
    const s = await TenantSettingsService.getClaimControls("t1");
    expect(s.requireFraudClearanceBeforeApproval).toBe(true);
    expect(s.fraudApprovalSeverityThreshold).toBe("MEDIUM"); // default fills the gap
  });
});

describe("updateClaimControls", () => {
  it("merges the patch, preserves other config keys, and audits old→new", async () => {
    db.tenant.findUnique.mockResolvedValue({
      config: { branding: { logo: "x" }, claims: { fraudApprovalSeverityThreshold: "LOW" } },
    });
    const after = await TenantSettingsService.updateClaimControls(
      "t1",
      { requireFraudClearanceBeforeApproval: true },
      "admin1",
    );

    expect(after.requireFraudClearanceBeforeApproval).toBe(true);
    // Prior threshold preserved (not reset to default by the partial patch).
    expect(after.fraudApprovalSeverityThreshold).toBe("LOW");

    const writeArg = db.tenant.update.mock.calls[0][0];
    // Unrelated config namespace survives the write.
    expect(writeArg.data.config.branding).toEqual({ logo: "x" });
    expect(writeArg.data.config.claims.requireFraudClearanceBeforeApproval).toBe(true);

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TENANT_CLAIM_CONTROL_UPDATED" }),
      }),
    );
  });

  it("ignores malformed patch values", async () => {
    db.tenant.findUnique.mockResolvedValue({ config: {} });
    const after = await TenantSettingsService.updateClaimControls(
      "t1",
      { fraudApprovalSeverityThreshold: "BOGUS" as any },
      "admin1",
    );
    expect(after.fraudApprovalSeverityThreshold).toBe("MEDIUM");
  });
});
