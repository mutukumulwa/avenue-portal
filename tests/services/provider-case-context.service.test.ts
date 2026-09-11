/**
 * Family Hospital UAT plan P02.01 — the provider case-context resolver.
 *
 * The oracle is plan §8.2 (member) and P02.01's acceptance: an authorised
 * facility resolves its member; another provider cannot infer that member
 * exists; an ineligible member is shown but cannot silently proceed; an
 * ambiguous contract blocks pricing; and the DTO carries nothing beyond the
 * minimum (no DOB, phone, email, address, diagnoses, raw member number).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  providerBranch: { findMany: vi.fn() },
  member: { findFirst: vi.fn() },
  providerContract: { findUnique: vi.fn() },
  providerEligibilityCheck: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const eligibility = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/server/services/provider-eligibility.service", () => ({ ProviderEligibilityService: eligibility }));
const entitlement = vi.hoisted(() => ({ entitledMemberWhere: vi.fn(async () => ({ group: { clientId: { in: ["client-1"] } } })) }));
vi.mock("@/server/services/provider-entitlement.service", () => ({ ProviderEntitlementService: entitlement }));
const settings = vi.hoisted(() => ({ isTariffCatalogEnabled: vi.fn(async () => true) }));
vi.mock("@/server/services/provider-access-settings.service", () => ({ ProviderAccessSettingsService: settings }));
const lifecycle = vi.hoisted(() => ({ precheck: vi.fn() }));
vi.mock("@/server/services/contract-lifecycle.service", () => ({ ContractLifecycleService: lifecycle }));
vi.mock("@/server/services/capture-telemetry", () => ({ captureEvent: vi.fn() }));

import { ProviderCaseContextService, maskMemberNumber, parseServiceDate } from "@/server/services/provider-case-context.service";
import type { ProviderAccessContext } from "@/server/services/provider-access.service";
import { operatingTodayISO } from "@/lib/service-date";

const ctx = (over: Partial<ProviderAccessContext> = {}): ProviderAccessContext => ({
  actorType: "USER",
  actorId: "user-1",
  tenantId: "tenant-1",
  providerId: "prov-1",
  allowedProviderBranchIds: ["br-main"],
  permissions: ["provider.claim.create", "provider.preauth.create", "provider.eligibility.read"],
  apiScopes: [],
  requestId: "req-1",
  ...over,
});

const today = operatingTodayISO();
const request = (over: Record<string, unknown> = {}) => ({
  purpose: "CLAIM" as const,
  memberNumber: "MTC-2026-00001",
  branchId: null,
  serviceDate: today,
  benefitCategory: "OUTPATIENT" as const,
  ...over,
});

function eligibleCheck(over: Record<string, unknown> = {}) {
  return {
    found: true,
    resultCode: "ELIGIBLE",
    memberId: "mem-1",
    member: { firstName: "Julius", lastName: "Mugerwa", memberNumber: "MTC-2026-00001" },
    schemeName: "Provider Onboarding Trial Scheme",
    packageName: "Medvex Premier",
    decision: { reasonCode: "ELIGIBLE", memberSafeExplanation: "Cover is active.", operatorGuidance: "" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.providerBranch.findMany.mockResolvedValue([{ id: "br-main", name: "Main" }]);
  db.member.findFirst.mockResolvedValue({ group: { clientId: "client-1" } });
  db.providerContract.findUnique.mockResolvedValue({
    id: "con-1", contractNumber: "PC-2026-202", currentVersionId: "ver-1", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null,
  });
  lifecycle.precheck.mockResolvedValue({ matched: true, message: "Matched", contract: { id: "con-1" } });
  eligibility.check.mockResolvedValue(eligibleCheck());
});

describe("helpers", () => {
  it("masks all but the last four characters", () => {
    expect(maskMemberNumber("MTC-2026-00001")).toBe("•••• 0001");
    expect(maskMemberNumber("12")).toBe("••••");
  });
  it("parses only real YYYY-MM-DD dates, to UTC midnight", () => {
    expect(parseServiceDate("2026-09-11")?.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(parseServiceDate("2026-02-30")).toBeNull();
    expect(parseServiceDate("11/09/2026")).toBeNull();
  });
});

describe("resolve — authorisation and input", () => {
  it("refuses a purpose the user has no permission for", async () => {
    const { result, trusted } = await ProviderCaseContextService.resolve(ctx({ permissions: ["provider.eligibility.read"] }), request());
    expect(result.outcome).toBe("FORBIDDEN");
    expect(trusted).toBeNull();
    expect(eligibility.check).not.toHaveBeenCalled();
  });

  it("refuses an unknown purpose", async () => {
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ purpose: "ADMIN" }));
    expect(result.outcome).toBe("INVALID");
  });

  it("refuses a future Kampala date with a field error", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ serviceDate: future }));
    expect(result).toMatchObject({ outcome: "INVALID", fieldErrors: { serviceDate: expect.stringMatching(/future/i) } });
  });

  it("a pre-authorisation may name a planned (future) date — the pre-auth intake always accepted one", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ purpose: "PREAUTH", serviceDate: future }));
    expect(result.outcome).toBe("RESOLVED");
    expect(eligibility.check).toHaveBeenCalledWith(expect.objectContaining({ serviceDate: parseServiceDate(future) }));
  });

  it("refuses CUSTOM, which providers are not offered (DEC-FH-02)", async () => {
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ benefitCategory: "CUSTOM" }));
    expect(result).toMatchObject({ outcome: "INVALID", fieldErrors: { benefitCategory: expect.any(String) } });
  });
});

describe("resolve — branch comes from the session, never the request", () => {
  it("auto-selects the user's only branch", async () => {
    const { result } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("RESOLVED");
    expect(db.providerBranch.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-1", providerId: "prov-1", isActive: true, id: { in: ["br-main"] } });
  });

  it("refuses a branch outside the user's permitted set", async () => {
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ branchId: "br-foreign" }));
    expect(result.outcome).toBe("FORBIDDEN");
    expect(eligibility.check).not.toHaveBeenCalled();
  });

  it("asks which branch when the user has several", async () => {
    db.providerBranch.findMany.mockResolvedValue([{ id: "br-a", name: "A" }, { id: "br-b", name: "B" }]);
    const { result } = await ProviderCaseContextService.resolve(ctx({ allowedProviderBranchIds: ["br-a", "br-b"] }), request());
    expect(result).toMatchObject({ outcome: "BRANCH_REQUIRED", branches: [{ id: "br-a", name: "A" }, { id: "br-b", name: "B" }] });
  });

  it("refuses a user with no active branch", async () => {
    db.providerBranch.findMany.mockResolvedValue([]);
    const { result } = await ProviderCaseContextService.resolve(ctx({ allowedProviderBranchIds: [] }), request());
    expect(result.outcome).toBe("FORBIDDEN");
  });
});

describe("resolve — member resolution (plan §8.2)", () => {
  it("resolves an authorised member to a minimal DTO with the contract's currency", async () => {
    const { result, trusted } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("RESOLVED");
    if (result.outcome !== "RESOLVED") return;
    expect(result.context).toEqual({
      memberRef: "mem-1",
      displayName: "Julius Mugerwa",
      maskedMemberNumber: "•••• 0001",
      eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." },
      schemeName: "Provider Onboarding Trial Scheme",
      packageName: "Medvex Premier",
      branch: { id: "br-main", name: "Main" },
      contract: { id: "con-1", number: "PC-2026-202", versionId: "ver-1" },
      currency: "UGX",
      serviceDate: today,
      benefitCategory: "OUTPATIENT",
      catalogueEnabled: true,
      unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
    });
    // Nothing identifying beyond the minimum crosses to the browser.
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("MTC-2026-00001");
    expect(trusted).toMatchObject({ memberId: "mem-1", clientId: "client-1", branchId: "br-main", contractId: "con-1", currency: "UGX", eligible: true });
  });

  it("passes the session's branch and the requested date to the eligibility service", async () => {
    await ProviderCaseContextService.resolve(ctx(), request());
    expect(eligibility.check).toHaveBeenCalledWith(expect.objectContaining({ memberNumber: "MTC-2026-00001", providerBranchId: "br-main", benefitCategory: "OUTPATIENT", serviceDate: new Date(`${today}T00:00:00Z`) }));
  });

  it("an unknown number and an out-of-entitlement number read identically", async () => {
    eligibility.check.mockResolvedValue({ found: false, resultCode: "NOT_ELIGIBLE", decision: { reasonCode: "NOT_FOUND" } });
    const absent = (await ProviderCaseContextService.resolve(ctx(), request({ memberNumber: "MTC-2026-99999" }))).result;
    const foreign = (await ProviderCaseContextService.resolve(ctx({ providerId: "prov-other" }), request())).result;
    expect(absent.outcome).toBe("NOT_FOUND");
    expect(foreign.outcome).toBe("NOT_FOUND");
    expect({ ...absent, correlationId: "" }).toEqual({ ...foreign, correlationId: "" });
  });

  it("a facility entitled to nobody is told so — without revealing the member", async () => {
    eligibility.check.mockResolvedValue({ found: false, resultCode: "NOT_ELIGIBLE", decision: { reasonCode: "PROVIDER_NOT_ENTITLED" } });
    const { result } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("FORBIDDEN");
  });

  it("an ineligible member is displayed but marked — it cannot silently proceed", async () => {
    eligibility.check.mockResolvedValue(
      eligibleCheck({ resultCode: "NOT_ELIGIBLE", decision: { reasonCode: "NOT_YET_ENROLLED", memberSafeExplanation: "Not enrolled on this date.", operatorGuidance: "Check the service date." } }),
    );
    const { result, trusted } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("INELIGIBLE");
    if (result.outcome === "INELIGIBLE") {
      expect(result.context.displayName).toBe("Julius Mugerwa");
      expect(result.context.eligibility).toEqual({ eligible: false, reasonCode: "NOT_YET_ENROLLED", message: "Not enrolled on this date. Check the service date." });
    }
    expect(trusted?.eligible).toBe(false);
  });

  it("rejects a malformed member number before any lookup", async () => {
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ memberNumber: "<script>" }));
    expect(result.outcome).toBe("INVALID");
    expect(eligibility.check).not.toHaveBeenCalled();
  });

  it("an opaque reference resolves only inside the facility's entitlement", async () => {
    db.member.findFirst.mockResolvedValueOnce(null); // not in scope
    const { result } = await ProviderCaseContextService.resolve(ctx(), request({ memberNumber: undefined, memberRef: "mem-foreign" }));
    expect(result.outcome).toBe("NOT_FOUND");
    expect(db.member.findFirst.mock.calls[0][0].where).toMatchObject({ id: "mem-foreign", tenantId: "tenant-1", group: { clientId: { in: ["client-1"] } } });
    expect(eligibility.check).not.toHaveBeenCalled();
  });
});

describe("resolve — contract context", () => {
  it("several matching contracts block pricing (AMBIGUOUS_CONTRACT)", async () => {
    lifecycle.precheck.mockResolvedValue({ matched: false, reasonCode: "CON-010", message: "Multiple" });
    const { result, trusted } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("AMBIGUOUS_CONTRACT");
    if (result.outcome === "AMBIGUOUS_CONTRACT") {
      expect(result.context.contract).toBeNull();
      expect(result.context.catalogueEnabled).toBe(false);
      expect(result.context.unlisted.allowed).toBe(false);
    }
    expect(trusted?.contractId).toBeNull();
  });

  it("no contract for the payer/branch/date is NO_ACTIVE_CONTRACT", async () => {
    lifecycle.precheck.mockResolvedValue({ matched: false, reasonCode: "CON-002", message: "Not contracted" });
    const { result } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome).toBe("NO_ACTIVE_CONTRACT");
  });

  it("asks the engine's precheck with the member's payer, the branch and the service date", async () => {
    await ProviderCaseContextService.resolve(ctx(), request());
    expect(lifecycle.precheck).toHaveBeenCalledWith({ tenantId: "tenant-1", providerId: "prov-1", providerBranchId: "br-main", clientId: "client-1", pricingDate: new Date(`${today}T00:00:00Z`) });
  });

  it("reports the catalogue as off when the facility flag is off", async () => {
    settings.isTariffCatalogEnabled.mockResolvedValueOnce(false);
    const { result } = await ProviderCaseContextService.resolve(ctx(), request());
    expect(result.outcome === "RESOLVED" && result.context.catalogueEnabled).toBe(false);
  });
});

describe("handoffFromEligibilityCheck — the opaque eligibility → claim reference", () => {
  it("reads only a recent ELIGIBLE check of this tenant and provider", async () => {
    db.providerEligibilityCheck.findFirst.mockResolvedValue({ memberId: "mem-1", providerBranchId: "br-main", requestedServiceDate: new Date(`${today}T00:00:00Z`), benefitCategory: "OUTPATIENT" });
    const h = await ProviderCaseContextService.handoffFromEligibilityCheck(ctx(), "cmtcheck0000000000000001");
    expect(h).toEqual({ memberRef: "mem-1", branchId: "br-main", serviceDate: today, benefitCategory: "OUTPATIENT" });
    const where = db.providerEligibilityCheck.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "cmtcheck0000000000000001", tenantId: "tenant-1", providerId: "prov-1", resultCode: "ELIGIBLE" });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("drops a branch the user may not use, and refuses malformed references", async () => {
    db.providerEligibilityCheck.findFirst.mockResolvedValue({ memberId: "mem-1", providerBranchId: "br-other", requestedServiceDate: new Date(`${today}T00:00:00Z`), benefitCategory: "CUSTOM" });
    expect(await ProviderCaseContextService.handoffFromEligibilityCheck(ctx(), "cmtcheck0000000000000001")).toMatchObject({ branchId: null, benefitCategory: null });
    expect(await ProviderCaseContextService.handoffFromEligibilityCheck(ctx(), "../../etc")).toBeNull();
  });
});
