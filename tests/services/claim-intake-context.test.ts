/**
 * Claims Autopilot F3.1 — derived intake context (the security boundary).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn() },
  providerBranch: { findFirst: vi.fn() },
  member: { findMany: vi.fn() },
}));
const entitlement = vi.hoisted(() => ({ entitledMemberWhere: vi.fn(async () => ({ __scoped: true })) }));
const providers = vi.hoisted(() => ({ isOperational: vi.fn(() => true) }));
const claims = vi.hoisted(() => ({ resolveClaimCurrency: vi.fn(async () => "UGX") }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: entitlement }));
vi.mock("@/server/services/providers.service", () => ({ ProvidersService: providers }));
vi.mock("@/server/services/claims.service", () => ({ ClaimsService: claims }));

import { resolveIntakeContext, type CallerIdentity } from "@/server/services/claim-intake/context";
import type { ClaimSubmissionV1 } from "@/server/services/claim-intake/schema";

function sub(over: Record<string, unknown> = {}): ClaimSubmissionV1 {
  return {
    schemaVersion: "1", idempotencyKey: "k",
    member: { memberNumber: "MBR-1" },
    provider: {},
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    lines: [{ serviceCategory: "CONSULTATION", description: "x", quantity: 1, unitCost: "1", billedAmount: "1" }],
    ...over,
  } as unknown as ClaimSubmissionV1;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.provider.findFirst.mockResolvedValue({ id: "prv-1", contractStatus: "ACTIVE", name: "Prov" });
  db.providerBranch.findFirst.mockResolvedValue({ id: "brn-1", isActive: true });
  db.member.findMany.mockResolvedValue([{ id: "mbr-1", group: { clientId: "cl-1" } }]);
  providers.isOperational.mockReturnValue(true);
  entitlement.entitledMemberWhere.mockResolvedValue({ __scoped: true });
  claims.resolveClaimCurrency.mockResolvedValue("UGX");
});

describe("F3.1 — channel/source/scope derivation", () => {
  it.each([
    ["operatorUser", { kind: "operatorUser", tenantId: "t1", userId: "u1" }, { provider: { providerId: "prv-1" } }, { channel: "ADMIN_PORTAL", source: "MANUAL", scopeKey: "user:u1", providerOwnsInvoiceNamespace: true, isSystemActor: false }],
    ["providerUser", { kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, {}, { channel: "PROVIDER_PORTAL", source: "MANUAL", scopeKey: "provider:prv-1", providerOwnsInvoiceNamespace: true, isSystemActor: false }],
    ["providerKey", { kind: "providerKey", tenantId: "t1", providerId: "prv-1", keyId: "key-9" }, {}, { channel: "API_V1", source: "HMS", scopeKey: "provider:prv-1", providerOwnsInvoiceNamespace: true, isSystemActor: false }],
    ["integrationKey", { kind: "integrationKey", tenantId: "t1", keyId: "int-9" }, { provider: { providerId: "prv-1" } }, { channel: "API_V1", source: "SMART", scopeKey: "integration:int-9", providerOwnsInvoiceNamespace: false, isSystemActor: true }],
    ["csvOperator", { kind: "csvOperator", tenantId: "t1", userId: "u1" }, { provider: { providerId: "prv-1" } }, { channel: "CSV_IMPORT", source: "BATCH", scopeKey: "user:u1", providerOwnsInvoiceNamespace: true, isSystemActor: false }],
    ["offlineDevice", { kind: "offlineDevice", tenantId: "t1", providerId: "prv-1", deviceId: "dev-9" }, {}, { channel: "OFFLINE_SYNC", source: "OFFLINE_SYNC", scopeKey: "device:prv-1:dev-9", providerOwnsInvoiceNamespace: true, isSystemActor: true }],
    ["reimbursement", { kind: "reimbursement", tenantId: "t1", userId: "u1" }, { provider: { providerId: "prv-1" } }, { channel: "REIMBURSEMENT", source: "REIMBURSEMENT", scopeKey: "reimbursement:mbr-1", providerOwnsInvoiceNamespace: false, isSystemActor: false }],
    ["preauthConversion", { kind: "preauthConversion", tenantId: "t1", preauthId: "pa-1", providerId: "prv-1", systemActorId: "sys" }, {}, { channel: "PREAUTH_CONVERSION", source: "PREAUTH", scopeKey: "preauth:pa-1", providerOwnsInvoiceNamespace: false, isSystemActor: true }],
    ["caseInterim", { kind: "caseSystem", tenantId: "t1", caseId: "case-1", isFinal: false, providerId: "prv-1", systemActorId: "sys" }, {}, { channel: "CASE_INTERIM", source: "HMS", scopeKey: "case:case-1", providerOwnsInvoiceNamespace: false, isSystemActor: true }],
    ["caseFinal", { kind: "caseSystem", tenantId: "t1", caseId: "case-1", isFinal: true, providerId: "prv-1", systemActorId: "sys" }, {}, { channel: "CASE_FINAL", source: "HMS", scopeKey: "case:case-1", providerOwnsInvoiceNamespace: false, isSystemActor: true }],
  ])("%s derives the right scope", async (_n, caller, over, expected) => {
    const ctx = await resolveIntakeContext(caller as CallerIdentity, sub(over));
    expect(ctx).toMatchObject({ tenantId: "t1", providerId: "prv-1", memberId: "mbr-1", clientId: "cl-1", ...expected });
  });

  it("respects a provider API key's declared source hint", async () => {
    const ctx = await resolveIntakeContext({ kind: "providerKey", tenantId: "t1", providerId: "prv-1", keyId: "k", sourceHint: "SLADE360" }, sub());
    expect(ctx.source).toBe("SLADE360");
  });

  it("sets integrationKeyId only for the integration channel", async () => {
    const intCtx = await resolveIntakeContext({ kind: "integrationKey", tenantId: "t1", keyId: "int-9" }, sub({ provider: { providerId: "prv-1" } }));
    expect(intCtx.integrationKeyId).toBe("int-9");
    const provCtx = await resolveIntakeContext({ kind: "providerKey", tenantId: "t1", providerId: "prv-1", keyId: "k" }, sub());
    expect(provCtx.integrationKeyId).toBeNull();
  });
});

describe("F3.1 — provider identity is derived, not trusted (D12)", () => {
  it("rejects a provider-rail body providerId that differs from the credential", async () => {
    await expect(
      resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ provider: { providerId: "prv-OTHER" } })),
    ).rejects.toMatchObject({ kind: "AUTHORIZATION" });
  });

  it("accepts a matching body providerId on a provider rail", async () => {
    const ctx = await resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ provider: { providerId: "prv-1" } }));
    expect(ctx.providerId).toBe("prv-1");
  });

  it("requires an operator rail to select a provider in the body", async () => {
    await expect(resolveIntakeContext({ kind: "operatorUser", tenantId: "t1", userId: "u1" }, sub({ provider: {} }))).rejects.toMatchObject({ kind: "VALIDATION" });
  });
});

describe("F3.1 — cross-scope isolation", () => {
  it("rejects a provider not in the caller's tenant", async () => {
    db.provider.findFirst.mockResolvedValue(null);
    await expect(resolveIntakeContext({ kind: "operatorUser", tenantId: "t1", userId: "u1" }, sub({ provider: { providerId: "prv-x" } }))).rejects.toMatchObject({ kind: "AUTHORIZATION" });
  });

  it("rejects a non-operational provider", async () => {
    providers.isOperational.mockReturnValue(false);
    await expect(resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub())).rejects.toMatchObject({ kind: "AUTHORIZATION" });
  });

  it("applies provider entitlement scoping for provider rails, not for operator rails", async () => {
    await resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub());
    expect(entitlement.entitledMemberWhere).toHaveBeenCalledWith("prv-1");
    entitlement.entitledMemberWhere.mockClear();
    await resolveIntakeContext({ kind: "operatorUser", tenantId: "t1", userId: "u1" }, sub({ provider: { providerId: "prv-1" } }));
    expect(entitlement.entitledMemberWhere).not.toHaveBeenCalled();
  });
});

describe("F3.1 — member resolution fails safe", () => {
  it("rejects a member not accessible to the caller without leaking existence", async () => {
    db.member.findMany.mockResolvedValue([]);
    await expect(resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub())).rejects.toMatchObject({ kind: "AUTHORIZATION" });
  });

  it("rejects an ambiguous member number", async () => {
    db.member.findMany.mockResolvedValue([{ id: "m1", group: { clientId: "c1" } }, { id: "m2", group: { clientId: "c2" } }]);
    await expect(resolveIntakeContext({ kind: "operatorUser", tenantId: "t1", userId: "u1" }, sub({ provider: { providerId: "prv-1" } }))).rejects.toMatchObject({ kind: "VALIDATION" });
  });
});

describe("F3.1 — branch validation and currency", () => {
  it("rejects a branch that does not belong to the provider", async () => {
    db.providerBranch.findFirst.mockResolvedValue(null);
    await expect(resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ provider: { providerId: "prv-1", branchId: "brn-x" } }))).rejects.toMatchObject({ kind: "VALIDATION" });
  });

  it("rejects a deactivated branch", async () => {
    db.providerBranch.findFirst.mockResolvedValue({ id: "brn-1", isActive: false });
    await expect(resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ provider: { providerId: "prv-1", branchId: "brn-1" } }))).rejects.toMatchObject({ kind: "VALIDATION" });
  });

  it("prefers a submitted currency, else resolves the claim currency", async () => {
    const declared = await resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ currency: "USD" }));
    expect(declared.currency).toBe("USD");
    expect(claims.resolveClaimCurrency).not.toHaveBeenCalled();
    const resolved = await resolveIntakeContext({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prv-1" }, sub({ currency: undefined }));
    expect(resolved.currency).toBe("UGX");
    expect(claims.resolveClaimCurrency).toHaveBeenCalledWith("t1", "prv-1", "mbr-1");
  });
});
