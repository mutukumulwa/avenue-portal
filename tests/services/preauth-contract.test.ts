/**
 * F3.1 — canonical PA submission contract (pure, no DB).
 *
 * Proves: equivalent submissions normalize + hash equivalently; provider/tenant
 * cannot be supplied as authority on provider channels; decimal/date/code
 * normalization is deterministic; per-channel required fields hold.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePreauth, validatePreauth, preauthRequestHash, resolveProviderId,
  type PreauthCallerContext, type PreauthSubmissionV1,
} from "@/server/services/preauth-intake/contract";

const providerCtx: PreauthCallerContext = { channel: "PROVIDER_API", tenantId: "t1", providerId: "pA", actorType: "API_KEY", actorId: "k1" };
const portalCtx: PreauthCallerContext = { channel: "PROVIDER_PORTAL", tenantId: "t1", providerId: "pA", actorType: "USER", actorId: "u1" };
const adminCtx: PreauthCallerContext = { channel: "ADMIN_TRPC", tenantId: "t1", actorType: "USER", actorId: "admin1" };

const base: PreauthSubmissionV1 = {
  memberNumber: "alp-0001",
  benefitCategory: "OUTPATIENT",
  diagnoses: [{ icdCode: " j06.9 ", description: "  Acute   URTI ", isPrimary: true }],
  procedures: [{ cptCode: "99213", description: "Consult", quantity: 2, unitCost: 1500 }],
  estimatedCost: 3000,
};

describe("F3.1 normalization is deterministic", () => {
  it("codes upper-trim, text collapses whitespace, money is an exact 2dp string, dates are date-level", () => {
    const { normalized } = normalizePreauth({ ...base, expectedDateOfService: "2026-08-01T13:45:00Z", estimatedCost: "3000.005" });
    expect(normalized.memberNumber).toBe("ALP-0001");
    expect(normalized.diagnoses[0]).toEqual({ code: "J06.9", description: "Acute URTI", isPrimary: true });
    expect(normalized.expectedDateOfService).toBe("2026-08-01"); // no timezone drift
    expect(normalized.estimatedCost).toMatch(/^\d+\.\d{2}$/); // exact decimal string, never a float
    // procedure total is derived exactly (2 × 1500.00)
    expect(normalized.procedures[0].total).toBe("3000.00");
    expect(normalized.procedures[0].unitCost).toBe("1500.00");
  });

  it("the same submission always normalizes and hashes identically", () => {
    const a = normalizePreauth(base).normalized;
    const b = normalizePreauth(JSON.parse(JSON.stringify(base))).normalized;
    expect(a).toEqual(b);
    expect(preauthRequestHash(providerCtx, a)).toBe(preauthRequestHash(providerCtx, b));
  });

  it("equivalent-but-differently-formatted submissions normalize equivalently", () => {
    const messy: PreauthSubmissionV1 = { ...base, memberNumber: "ALP-0001", diagnoses: [{ code: "j06.9", description: "Acute URTI", isPrimary: true }], estimatedCost: "3000.00" };
    expect(normalizePreauth(messy).normalized).toEqual(normalizePreauth(base).normalized);
  });

  it("a different provider yields a different request hash for the same payload", () => {
    const n = normalizePreauth(base).normalized;
    const other: PreauthCallerContext = { ...providerCtx, providerId: "pB" };
    expect(preauthRequestHash(providerCtx, n)).not.toBe(preauthRequestHash(other, n));
  });

  it("rejects a negative or unparseable estimate (no silent zero)", () => {
    expect(normalizePreauth({ ...base, estimatedCost: -5 }).normalized.estimatedCost).toBe("");
    expect(normalizePreauth({ ...base, estimatedCost: "abc" }).normalized.estimatedCost).toBe("");
  });
});

describe("F3.1 provider authority cannot be supplied by the caller", () => {
  it("a provider channel ignores/rejects a body-supplied providerId", () => {
    const n = normalizePreauth({ ...base, providerId: "pEVIL" }).normalized;
    const res = resolveProviderId(providerCtx, n);
    expect(res.error?.code).toBe("PROVIDER_FORGERY");
    expect(validatePreauth(providerCtx, n).map((e) => e.code)).toContain("PROVIDER_FORGERY");
  });

  it("a matching body providerId is harmless; the context value is used", () => {
    const n = normalizePreauth({ ...base, providerId: "pA" }).normalized;
    expect(resolveProviderId(providerCtx, n)).toEqual({ providerId: "pA" });
  });

  it("admin/member channels legitimately choose the facility", () => {
    const n = normalizePreauth({ ...base, memberId: "m1", memberNumber: undefined, providerId: "pZ", serviceType: "OUTPATIENT" }).normalized;
    expect(resolveProviderId(adminCtx, n)).toEqual({ providerId: "pZ" });
    expect(validatePreauth(adminCtx, n)).toEqual([]);
  });

  it("an admin submission with no facility is rejected", () => {
    const n = normalizePreauth({ ...base, memberId: "m1", serviceType: "OUTPATIENT" }).normalized;
    expect(validatePreauth(adminCtx, n).map((e) => e.code)).toContain("MISSING_PROVIDER");
  });
});

describe("F3.1 per-channel required fields", () => {
  it("the API channel requires memberNumber and refuses an internal memberId", () => {
    const ok = normalizePreauth(base).normalized;
    expect(validatePreauth(providerCtx, ok)).toEqual([]);
    const withId = normalizePreauth({ ...base, memberId: "m1" }).normalized;
    expect(validatePreauth(providerCtx, withId).map((e) => e.code)).toContain("MEMBER_ID_NOT_ACCEPTED");
    const noMember = normalizePreauth({ ...base, memberNumber: undefined }).normalized;
    expect(validatePreauth(providerCtx, noMember).map((e) => e.code)).toContain("MISSING_MEMBER_IDENTIFIER");
  });

  it("portal channels require a service type; the API channel does not", () => {
    const n = normalizePreauth(base).normalized;
    expect(validatePreauth(portalCtx, n).map((e) => e.code)).toContain("MISSING_SERVICE_TYPE");
    expect(validatePreauth(providerCtx, n).map((e) => e.code)).not.toContain("MISSING_SERVICE_TYPE");
  });

  it("benefit category, at least one diagnosis, and a valid estimate are always required", () => {
    const n = normalizePreauth({ memberNumber: "X", diagnoses: [], estimatedCost: "nope" }).normalized;
    const codes = validatePreauth(providerCtx, n).map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["MISSING_BENEFIT_CATEGORY", "MISSING_DIAGNOSES", "INVALID_ESTIMATE"]));
  });

  it("an invalid date is flagged, not silently dropped", () => {
    const { normalized, dateInvalid } = normalizePreauth({ ...base, expectedDateOfService: "not-a-date" });
    expect(dateInvalid).toBe(true);
    expect(validatePreauth(providerCtx, normalized, { dateInvalid }).map((e) => e.code)).toContain("INVALID_DATE");
  });

  it("an amendment must reference its parent", () => {
    const amendCtx: PreauthCallerContext = { channel: "AMENDMENT", tenantId: "t1", providerId: "pA", actorType: "SYSTEM", actorId: "sys" };
    const n = normalizePreauth(base).normalized;
    expect(validatePreauth(amendCtx, n).map((e) => e.code)).toContain("MISSING_PARENT_PREAUTH");
  });
});
