/**
 * Claims Autopilot F1.1 — versioned envelope schema tests.
 *
 * "Done when: the same schema accepts inputs representing every golden scenario."
 * Plus every structural negative in §7.3 and privilege-field rejection (§7.2).
 */
import { describe, it, expect } from "vitest";
import {
  ClaimSubmissionV1Schema,
  parseClaimSubmissionV1,
  LIMITS,
  SUPPORTED_SCHEMA_VERSION,
} from "@/server/services/claim-intake/schema";
import { GOLDEN_SCENARIOS } from "../fixtures/claims-autopilot";

// A structurally valid minimal envelope, cloned per test and then broken.
function baseValid() {
  return {
    schemaVersion: "1",
    idempotencyKey: "valid-key-0001",
    member: { memberNumber: "MBR-1" },
    provider: {},
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    lines: [
      { serviceCategory: "CONSULTATION", description: "GP consult", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" },
    ],
    currency: "UGX",
  };
}

describe("F1.1 ClaimSubmissionV1 — accepts every golden scenario", () => {
  it.each(GOLDEN_SCENARIOS.map((s) => [s.name, s] as const))("accepts %s (submission + any secondSubmission)", (_n, sc) => {
    const a = parseClaimSubmissionV1(sc.submission);
    expect(a.success, a.success ? "" : JSON.stringify(a.error?.issues)).toBe(true);
    if (sc.secondSubmission) {
      const b = parseClaimSubmissionV1(sc.secondSubmission);
      expect(b.success, b.success ? "" : JSON.stringify(b.error?.issues)).toBe(true);
    }
  });
});

describe("F1.1 — valid envelopes", () => {
  it("accepts a minimal envelope", () => {
    expect(parseClaimSubmissionV1(baseValid()).success).toBe(true);
  });

  it("accepts a maximal envelope at every configured bound (CA-002)", () => {
    const lines = Array.from({ length: LIMITS.MAX_LINES }, (_, i) => ({
      sourceLineRef: `L${i + 1}`,
      serviceCategory: "LABORATORY",
      cptCode: "85025",
      icdCode: "J06.9",
      description: "x".repeat(LIMITS.MAX_DESCRIPTION),
      quantity: 2,
      unitCost: "1000.00",
      billedAmount: "2000.00",
    }));
    const diagnoses = Array.from({ length: LIMITS.MAX_DIAGNOSES }, (_, i) => ({
      code: "J06.9",
      description: "d".repeat(LIMITS.MAX_DESCRIPTION),
      isPrimary: i === 0,
    }));
    const maximal = {
      schemaVersion: "1",
      idempotencyKey: "k".repeat(LIMITS.IDEMPOTENCY_KEY_MAX),
      externalClaimRef: "e".repeat(LIMITS.MAX_REF),
      externalEncounterRef: "n".repeat(LIMITS.MAX_REF),
      invoiceNumber: "INV-MAX",
      submittedAt: "2026-06-01T09:30:00Z",
      sourceUpdatedAt: "2026-06-01T09:31:00Z",
      member: { memberId: "mbr-1", memberNumber: "MBR-1" },
      provider: { providerId: "prv-1", branchId: "brn-1", practitionerRef: "DOC-1" },
      encounter: {
        serviceType: "INPATIENT",
        benefitCategory: "INPATIENT",
        serviceFrom: "2026-06-01",
        serviceTo: "2026-06-05",
        admissionDate: "2026-06-01",
        dischargeDate: "2026-06-05",
        attendingDoctor: "Dr Test",
      },
      diagnoses,
      lines,
      currency: "UGX",
      preauthRefs: Array.from({ length: LIMITS.MAX_PREAUTH_REFS }, (_, i) => `PA-${i}`),
      attachmentRefs: Array.from({ length: LIMITS.MAX_ATTACHMENTS }, (_, i) => ({ externalRef: `att-${i}`, category: "RECEIPT", sha256: "a".repeat(64) })),
      origin: { batchId: "b1", rowNumber: 3, deviceId: "dev-1", caseId: "case-1", caseSliceSeq: 1, reimbursementRequestId: "rr-1" },
      replacementOfClaimRef: "CLM-OLD",
      correctionReason: "resubmission after correction",
    };
    const r = parseClaimSubmissionV1(maximal);
    expect(r.success, r.success ? "" : JSON.stringify(r.error?.issues)).toBe(true);
  });
});

describe("F1.1 — structural rejections (§7.3)", () => {
  const cases: Array<[string, (b: ReturnType<typeof baseValid>) => unknown]> = [
    ["unknown schema version (CA-004)", (b) => ({ ...b, schemaVersion: "2" })],
    ["idempotency key too short", (b) => ({ ...b, idempotencyKey: "short" })],
    ["idempotency key too long", (b) => ({ ...b, idempotencyKey: "k".repeat(LIMITS.IDEMPOTENCY_KEY_MAX + 1) })],
    ["idempotency key with unsafe chars", (b) => ({ ...b, idempotencyKey: "bad key/with spaces" })],
    ["no lines", (b) => ({ ...b, lines: [] })],
    ["too many lines", (b) => ({ ...b, lines: Array.from({ length: LIMITS.MAX_LINES + 1 }, () => b.lines[0]) })],
    ["blank description", (b) => ({ ...b, lines: [{ ...b.lines[0], description: "   " }] })],
    ["description too long", (b) => ({ ...b, lines: [{ ...b.lines[0], description: "x".repeat(LIMITS.MAX_DESCRIPTION + 1) }] })],
    ["non-integer quantity", (b) => ({ ...b, lines: [{ ...b.lines[0], quantity: 1.5 }] })],
    ["zero quantity", (b) => ({ ...b, lines: [{ ...b.lines[0], quantity: 0 }] })],
    ["negative quantity", (b) => ({ ...b, lines: [{ ...b.lines[0], quantity: -1, unitCost: "1500.00", billedAmount: "1500.00" }] })],
    ["non-positive unit cost", (b) => ({ ...b, lines: [{ ...b.lines[0], unitCost: "0", billedAmount: "0" }] })],
    ["NaN money", (b) => ({ ...b, lines: [{ ...b.lines[0], unitCost: Number.NaN, billedAmount: Number.NaN }] })],
    ["Infinity money", (b) => ({ ...b, lines: [{ ...b.lines[0], unitCost: Number.POSITIVE_INFINITY, billedAmount: Number.POSITIVE_INFINITY }] })],
    ["exponent money string", (b) => ({ ...b, lines: [{ ...b.lines[0], unitCost: "1e3", billedAmount: "1e3" }] })],
    ["excessive decimal scale", (b) => ({ ...b, lines: [{ ...b.lines[0], unitCost: "1500.123456", billedAmount: "1500.123456" }] })],
    ["billed != qty × unit (CA-007)", (b) => ({ ...b, lines: [{ ...b.lines[0], quantity: 2, unitCost: "1500.00", billedAmount: "1500.00" }] })],
    ["invalid currency", (b) => ({ ...b, currency: "shillings" })],
    ["lowercase currency", (b) => ({ ...b, currency: "ugx" })],
    ["malformed service date", (b) => ({ ...b, encounter: { ...b.encounter, serviceFrom: "not-a-date" } })],
    ["service end before start", (b) => ({ ...b, encounter: { ...b.encounter, serviceFrom: "2026-06-05", serviceTo: "2026-06-01" } })],
    ["discharge before admission", (b) => ({ ...b, encounter: { ...b.encounter, admissionDate: "2026-06-05", dischargeDate: "2026-06-01" } })],
    ["two primary diagnoses", (b) => ({ ...b, diagnoses: [{ code: "J06.9", isPrimary: true }, { code: "I10", isPrimary: true }] })],
    ["zero primary diagnoses (when present)", (b) => ({ ...b, diagnoses: [{ code: "J06.9", isPrimary: false }] })],
    ["member missing id and number", (b) => ({ ...b, member: {} })],
    ["bad ICD code chars", (b) => ({ ...b, lines: [{ ...b.lines[0], icdCode: "J06 9!" }] })],
    ["HTML in description (CA-005 injection)", (b) => ({ ...b, lines: [{ ...b.lines[0], description: "<script>alert(1)</script>" }] })],
    ["bad sha256 in attachment", (b) => ({ ...b, attachmentRefs: [{ category: "RECEIPT", sha256: "zz" }] })],
  ];

  it.each(cases)("rejects: %s", (_label, mutate) => {
    const r = parseClaimSubmissionV1(mutate(baseValid()));
    expect(r.success).toBe(false);
  });
});

describe("F1.1 — privilege/unknown field rejection (§7.2, strict)", () => {
  it.each([
    ["tenantId", { tenantId: "t-attacker" }],
    ["clientId", { clientId: "c-attacker" }],
    ["decision", { decision: "APPROVED" }],
    ["payableAmount", { payableAmount: "999999" }],
    ["reviewerRole", { reviewerRole: "SUPER_ADMIN" }],
    ["policyId", { policyId: "pol-1" }],
    ["receiptState", { receiptState: "SUCCEEDED" }],
    ["processingState", { processingState: "AUTO_DECIDED" }],
  ])("rejects a top-level %s privilege field", (_n, extra) => {
    const r = parseClaimSubmissionV1({ ...baseValid(), ...extra });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown nested field on a line", () => {
    const b = baseValid();
    const r = parseClaimSubmissionV1({ ...b, lines: [{ ...b.lines[0], approvedAmount: "1500" }] });
    expect(r.success).toBe(false);
  });

  it("exposes the supported version constant", () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe("1");
    expect(ClaimSubmissionV1Schema).toBeDefined();
  });
});
