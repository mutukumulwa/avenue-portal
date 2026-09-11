/**
 * Family Hospital UAT plan P04.01 / P04.02 / §8.2 item 4 — the one preparation
 * step for provider-captured claims. Submission repeats resolution and refuses
 * an ineligible or stale case; the diagnosis and every line are rebuilt on the
 * server; the browser picks neither purpose, member (for a replacement), rate
 * nor currency.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const svc = vi.hoisted(() => ({
  resolve: vi.fn(),
  canonical: vi.fn(),
  canonicalizeLines: vi.fn(),
}));
vi.mock("@/server/services/provider-case-context.service", () => ({ ProviderCaseContextService: { resolve: svc.resolve } }));
vi.mock("@/server/services/provider-diagnosis-search.service", () => ({ ProviderDiagnosisSearchService: { canonical: svc.canonical } }));
vi.mock("@/server/services/provider-service-catalog.service", () => ({ ProviderServiceCatalogService: { canonicalizeLines: svc.canonicalizeLines } }));

import { ProviderClaimCaptureService, caseFailure, intakeFailure } from "@/server/services/provider-claim-capture.service";
import type { ProviderAccessContext } from "@/server/services/provider-access.service";

const CTX: ProviderAccessContext = {
  actorType: "PROVIDER_USER" as ProviderAccessContext["actorType"], actorId: "u1", tenantId: "t1", providerId: "prov-fh",
  allowedProviderBranchIds: ["br-main"], permissions: ["provider.claim.create", "provider.claim.correct"], apiScopes: [], requestId: "req-1",
};
const TRUSTED = {
  tenantId: "t1", providerId: "prov-fh", actorId: "u1", purpose: "CLAIM", memberId: "mem-1", clientId: "client-trial", branchId: "br-main",
  serviceDate: new Date("2026-09-11T00:00:00Z"), serviceDateIso: "2026-09-11", benefitCategory: "OUTPATIENT", eligible: true,
  contractId: "con-fh", contractVersionId: "ver-fh", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, catalogueEnabled: true,
};
const DTO = { memberRef: "mem-1", displayName: "x", maskedMemberNumber: "•••• 0001", eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "" }, schemeName: null, packageName: null, branch: { id: "br-main", name: "Main" }, contract: { id: "con-fh", number: "PC", versionId: "ver-fh" }, currency: "UGX", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT", catalogueEnabled: true, unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "" } };
const LINES = [
  { serviceCategory: "LABORATORY", description: "Full Blood Count", cptCode: null, quantity: 2, unitCost: "30000", billedAmount: "60000", selectedProviderTariffId: "t-fbc", tariffRate: "25000", currency: "UGX", unlisted: false },
  { serviceCategory: "OTHER", description: "Special dressing", cptCode: null, quantity: 1, unitCost: "15000", billedAmount: "15000", selectedProviderTariffId: null, tariffRate: null, currency: "UGX", unlisted: true },
];

const input = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: "op_4b0c3a9e-1111-4222-8333-444455556666",
  context: { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" },
  expectedContractVersionId: "ver-fh",
  serviceType: "OUTPATIENT",
  attendingDoctor: "  Dr.   Sarah  Nakiwala ",
  diagnosisCode: "b54",
  lines: [{ selectedProviderTariffId: "t-fbc", serviceCategory: "LABORATORY", quantity: "2", billedUnitPrice: "30000" }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  svc.resolve.mockResolvedValue({ result: { outcome: "RESOLVED", context: DTO, correlationId: "cor-1" }, trusted: TRUSTED });
  svc.canonical.mockResolvedValue({ code: "B54", description: "Malaria, unspecified" });
  svc.canonicalizeLines.mockResolvedValue({ ok: true, lines: LINES, totalBilled: "75000", currency: "UGX" });
});

describe("ProviderClaimCaptureService.prepare", () => {
  it("re-resolves the case for the purpose the SERVER names, from the reference only", async () => {
    const r = await ProviderClaimCaptureService.prepare(CTX, input({ context: { purpose: "ELIGIBILITY", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT", memberNumber: "MTC-1" } }), { purpose: "CLAIM" });
    expect(r.ok).toBe(true);
    expect(svc.resolve).toHaveBeenCalledWith(CTX, { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" });
  });

  it("returns the canonical claim: catalogue diagnosis, canonical lines, cleaned clinician", async () => {
    const r = await ProviderClaimCaptureService.prepare(CTX, input(), { purpose: "CLAIM" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.prepared.diagnosis).toEqual({ code: "B54", description: "Malaria, unspecified" });
    expect(r.prepared.attendingDoctor).toBe("Dr. Sarah Nakiwala");
    expect(r.prepared.totalBilled).toBe("75000");
    expect(svc.canonicalizeLines).toHaveBeenCalledWith(TRUSTED, input().lines, {});
    expect(ProviderClaimCaptureService.intakeLines(r.prepared)).toEqual([
      { serviceCategory: "LABORATORY", cptCode: "", description: "Full Blood Count", icdCode: "B54", quantity: 2, unitCost: "30000", billedAmount: "60000" },
      { serviceCategory: "OTHER", cptCode: "", description: "Special dressing", icdCode: "B54", quantity: 1, unitCost: "15000", billedAmount: "15000" },
    ]);
    expect(ProviderClaimCaptureService.lineProvenance(r.prepared)).toEqual([
      { lineNumber: 1, selectedProviderTariffId: "t-fbc", tariffRate: "25000" },
      { lineNumber: 2, selectedProviderTariffId: null, tariffRate: null },
    ]);
  });

  it("refuses an ineligible member — shown on the member field, nothing else read", async () => {
    svc.resolve.mockResolvedValue({ result: { outcome: "INELIGIBLE", context: DTO, message: "Cover lapsed before this date.", correlationId: "cor-2" }, trusted: { ...TRUSTED, eligible: false } });
    const r = await ProviderClaimCaptureService.prepare(CTX, input(), { purpose: "CLAIM" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe("VALIDATION");
    expect(r.failure.correlationId).toBe("cor-2");
    expect(r.failure.fieldErrors?.member?.[0]).toMatch(/^Not eligible on this date.*Cover lapsed before this date\.$/);
    expect(svc.canonicalizeLines).not.toHaveBeenCalled();
  });

  it("refuses a stale case: the contract version changed after the form priced it", async () => {
    const r = await ProviderClaimCaptureService.prepare(CTX, input({ expectedContractVersionId: "ver-OLD" }), { purpose: "CLAIM" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe("CONFLICT");
    expect(r.failure.message).toMatch(/Find the member again/);
    expect(svc.canonicalizeLines).not.toHaveBeenCalled();
  });

  it("a missing expected version is stale too (the form always sends it)", async () => {
    const r = await ProviderClaimCaptureService.prepare(CTX, input({ expectedContractVersionId: undefined }), { purpose: "CLAIM" });
    expect(r.ok ? null : r.failure.kind).toBe("CONFLICT");
  });

  it("a correction cannot move the claim to another member or branch", async () => {
    await ProviderClaimCaptureService.prepare(CTX, input({ context: { memberRef: "mem-OTHER", branchId: "br-other", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" } }), {
      purpose: "CLAIM_CORRECTION",
      fixed: { memberId: "mem-1", branchId: "br-main" },
    });
    expect(svc.resolve).toHaveBeenCalledWith(CTX, expect.objectContaining({ purpose: "CLAIM_CORRECTION", memberRef: "mem-1", branchId: "br-main" }));
  });

  it("a legacy earlier claim without a branch takes the branch resolved for this user", async () => {
    await ProviderClaimCaptureService.prepare(CTX, input(), { purpose: "CLAIM_CORRECTION", fixed: { memberId: "mem-1", branchId: null } });
    expect(svc.resolve).toHaveBeenCalledWith(CTX, expect.objectContaining({ memberRef: "mem-1", branchId: "br-main" }));
  });

  it("collects diagnosis, service type, clinician and line problems together", async () => {
    svc.canonical.mockResolvedValue(null);
    svc.canonicalizeLines.mockResolvedValue({ ok: false, message: "x", fieldErrors: { "lines.0.service": "This service is no longer on your price list for this date. Select the service again." } });
    const r = await ProviderClaimCaptureService.prepare(CTX, input({ serviceType: "SPA", attendingDoctor: "<b>Dr</b>" }), { purpose: "CLAIM" });
    if (r.ok) throw new Error("expected failure");
    expect(r.failure.kind).toBe("VALIDATION");
    expect(Object.keys(r.failure.fieldErrors ?? {}).sort()).toEqual(["attendingDoctor", "diagnosis", "lines.0.service", "serviceType"]);
    expect(r.failure.fieldErrors?.["lines.0.service"]).toEqual(["This service is no longer on your price list for this date. Select the service again."]);
  });

  it("rejects a malformed idempotency key before any lookup", async () => {
    const r = await ProviderClaimCaptureService.prepare(CTX, input({ idempotencyKey: "short" }), { purpose: "CLAIM" });
    expect(r.ok ? null : r.failure.kind).toBe("VALIDATION");
    expect(svc.resolve).not.toHaveBeenCalled();
  });
});

/**
 * P08.01 (case 29) — a pre-authorisation amendment's lines are revalidated like
 * a new request's, against the PARENT's member, date and benefit (fixed by the
 * server), never the form's.
 */
describe("ProviderClaimCaptureService.prepareLines — amendment revalidation", () => {
  const PARENT = { memberId: "mem-1", branchId: null, serviceDate: "2026-09-20", benefitCategory: "SURGICAL" as const };
  const amendInput = (over: Record<string, unknown> = {}) => ({
    context: { purpose: "PREAUTH", memberRef: "mem-OTHER", branchId: "br-main", serviceDate: "2030-01-01", benefitCategory: "OUTPATIENT" },
    expectedContractVersionId: "ver-fh",
    lines: [{ selectedProviderTariffId: "t-exc", serviceCategory: "PROCEDURE", quantity: "1", billedUnitPrice: "600,000" }],
    ...over,
  });

  it("re-resolves the parent's case — not the form's member, date or benefit — and rebuilds the lines from the price list", async () => {
    const r = await ProviderClaimCaptureService.prepareLines(CTX, amendInput(), { purpose: "PREAUTH", fixed: PARENT });
    expect(r.ok).toBe(true);
    expect(svc.resolve).toHaveBeenCalledWith(CTX, { purpose: "PREAUTH", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-20", benefitCategory: "SURGICAL" });
    expect(svc.canonicalizeLines).toHaveBeenCalledWith(TRUSTED, amendInput().lines, {});
  });

  it("a service that left the price list refuses the amendment on that line", async () => {
    svc.canonicalizeLines.mockResolvedValue({ ok: false, message: "x", fieldErrors: { "lines.0.service": "This service is no longer on your price list for this date. Select the service again." } });
    const r = await ProviderClaimCaptureService.prepareLines(CTX, amendInput(), { purpose: "PREAUTH", fixed: PARENT });
    if (r.ok) throw new Error("expected failure");
    expect(r.failure.kind).toBe("VALIDATION");
    expect(r.failure.fieldErrors?.["lines.0.service"]).toEqual(["This service is no longer on your price list for this date. Select the service again."]);
  });

  it("a changed contract version is a conflict and nothing is rebuilt", async () => {
    const r = await ProviderClaimCaptureService.prepareLines(CTX, amendInput({ expectedContractVersionId: "ver-OLD" }), { purpose: "PREAUTH", fixed: PARENT });
    expect(r.ok ? null : r.failure.kind).toBe("CONFLICT");
    expect(svc.canonicalizeLines).not.toHaveBeenCalled();
  });

  it("a member no longer eligible on the parent's date refuses", async () => {
    svc.resolve.mockResolvedValue({ result: { outcome: "INELIGIBLE", context: DTO, message: "Cover lapsed before this date.", correlationId: "cor-3" }, trusted: { ...TRUSTED, eligible: false } });
    const r = await ProviderClaimCaptureService.prepareLines(CTX, amendInput(), { purpose: "PREAUTH", fixed: PARENT });
    expect(r.ok ? null : r.failure.kind).toBe("VALIDATION");
    expect(svc.canonicalizeLines).not.toHaveBeenCalled();
  });
});

describe("caseFailure — the resolver's outcomes as form outcomes", () => {
  it.each([
    [{ outcome: "NOT_FOUND", message: "No member found for that number. Check the card and try again.", correlationId: "c" }, "VALIDATION", "member"],
    [{ outcome: "BRANCH_REQUIRED", message: "Choose the branch where the patient is being seen.", correlationId: "c" }, "VALIDATION", "member"],
    [{ outcome: "INVALID", message: "x", fieldErrors: { serviceDate: "The date of service cannot be in the future." }, correlationId: "c" }, "VALIDATION", "serviceDate"],
    [{ outcome: "NO_ACTIVE_CONTRACT", context: DTO, message: "No active contract covers this patient's scheme at this branch on this date. Contact Medvex.", correlationId: "c" }, "VALIDATION", "member"],
    [{ outcome: "AMBIGUOUS_CONTRACT", context: DTO, message: "More than one active contract…", correlationId: "c" }, "VALIDATION", "member"],
  ] as const)("%o → %s on %s", (result, kind, field) => {
    const f = caseFailure(result as Parameters<typeof caseFailure>[0]);
    expect(f.kind).toBe(kind);
    expect(f.fieldErrors?.[field]?.length).toBe(1);
  });

  it("FORBIDDEN and UNAVAILABLE keep their kinds and say nothing about the member", () => {
    expect(caseFailure({ outcome: "FORBIDDEN", message: "You do not have permission to do this.", correlationId: "c" }).kind).toBe("FORBIDDEN");
    const u = caseFailure({ outcome: "UNAVAILABLE", message: "Member lookup is temporarily unavailable. Try again shortly.", correlationId: "c" });
    expect(u.kind).toBe("UNAVAILABLE");
    expect(u.fieldErrors).toBeUndefined();
  });
});

describe("intakeFailure — only an unexpected intake error is an unknown outcome", () => {
  it.each([
    ["FORBIDDEN_SCOPE", "FORBIDDEN"],
    ["UNAUTHENTICATED", "FORBIDDEN"],
    ["IDEMPOTENCY_KEY_REUSED", "CONFLICT"],
    ["RETRYABLE_UNAVAILABLE", "UNAVAILABLE"],
    ["INTERNAL_ERROR", "UNKNOWN_OUTCOME"],
    ["VALIDATION_FAILED", "VALIDATION"],
  ])("%s → %s", (code, kind) => {
    expect(intakeFailure(code, "msg").kind).toBe(kind);
  });
});
