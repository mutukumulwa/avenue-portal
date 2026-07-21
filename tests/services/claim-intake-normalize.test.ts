/**
 * Claims Autopilot F1.2 — canonical normalization tests.
 *
 * "Done when: API, UI, CSV and offline representations of the same golden claim
 * normalize to the same canonical object."
 */
import { describe, it, expect } from "vitest";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import {
  normalizeSubmission,
  canonicalDecimal,
  normalizeText,
  normalizeCode,
  normalizeCalendarDate,
  normalizeInstant,
} from "@/server/services/claim-intake/normalize";

/** Parse (to guarantee validity) then normalize. */
function norm(raw: unknown) {
  const parsed = parseClaimSubmissionV1(raw);
  if (!parsed.success) throw new Error("fixture is not schema-valid: " + JSON.stringify(parsed.error.issues));
  return normalizeSubmission(parsed.data);
}

const KEY = "same-claim-key-0001";

describe("F1.2 — cross-rail equivalence (Done-when)", () => {
  // Four representations of ONE clean claim. They differ only in money type,
  // whitespace, code case and line order (with source refs). They must be equal.
  const apiRail = {
    schemaVersion: "1",
    idempotencyKey: KEY,
    member: { memberId: "mbr-1", memberNumber: "MBR-1" },
    provider: { providerId: "prv-1" },
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    lines: [
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP consultation", quantity: 1, unitCost: 1500, billedAmount: 1500 },
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "Full blood count", quantity: 1, unitCost: 2000, billedAmount: 2000 },
    ],
    currency: "UGX",
  };
  const uiRail = {
    ...apiRail,
    lines: [
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "  GP   consultation ", quantity: 1, unitCost: "1500.00", billedAmount: "1500.00" },
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "Full blood count", quantity: 1, unitCost: "2000.0", billedAmount: "2000.00" },
    ],
  };
  const csvRail = {
    ...apiRail,
    // lowercase codes + reversed line order (refs present ⇒ order-independent).
    lines: [
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "j06.9", description: "Full blood count", quantity: 1, unitCost: "2000", billedAmount: "2000" },
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "j06.9", description: "GP consultation", quantity: 1, unitCost: "1500", billedAmount: "1500" },
    ],
  };
  const offlineRail = {
    ...apiRail,
    lines: [
      { sourceLineRef: "L1", serviceCategory: "CONSULTATION", cptCode: "99213", icdCode: "J06.9", description: "GP consultation", quantity: 1, unitCost: 1500.0, billedAmount: 1500.0 },
      { sourceLineRef: "L2", serviceCategory: "LABORATORY", cptCode: "85025", icdCode: "J06.9", description: "Full blood count", quantity: 1, unitCost: 2000, billedAmount: 2000 },
    ],
  };

  it("all four rails normalize to the same canonical object", () => {
    const a = norm(apiRail);
    const u = norm(uiRail);
    const c = norm(csvRail);
    const o = norm(offlineRail);
    expect(u).toEqual(a);
    expect(c).toEqual(a);
    expect(o).toEqual(a);
    // And the canonical shape is what we expect.
    expect(a.lines.map((l) => l.lineNumber)).toEqual([1, 2]);
    expect(a.lines.map((l) => l.sourceLineRef)).toEqual(["L1", "L2"]);
    expect(a.totalBilled).toBe("3500");
    expect(a.lines[0].unitCost).toBe("1500");
    expect(a.lines[0].billedAmount).toBe("1500");
  });
});

describe("F1.2 — money equivalence and safety", () => {
  it("number and decimal-string money canonicalize identically", () => {
    expect(canonicalDecimal(1500)).toBe(canonicalDecimal("1500.00"));
    expect(canonicalDecimal("1500.0")).toBe("1500");
    expect(canonicalDecimal(40.5)).toBe(canonicalDecimal("40.50"));
    expect(canonicalDecimal("40.50")).toBe("40.5");
  });

  it("rounds recomputed billed to the money-posting scale (HALF_UP, 2dp)", () => {
    const s = norm({
      schemaVersion: "1", idempotencyKey: "rounding-key-1",
      member: { memberNumber: "M" }, provider: {},
      encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
      diagnoses: [{ code: "J06.9", isPrimary: true }],
      // 3 × 33.333 = 99.999 → billed 100.00 (within 0.01 tolerance for the schema); recompute rounds to 100.
      lines: [{ serviceCategory: "OTHER", description: "svc", quantity: 3, unitCost: "33.333", billedAmount: "100.00" }],
      currency: "UGX",
    });
    expect(s.lines[0].unitCost).toBe("33.333");
    expect(s.lines[0].billedAmount).toBe("100");
    expect(s.totalBilled).toBe("100");
  });

  it("handles large exact integer money without float overflow", () => {
    const big = "999999999999999"; // 15 digits, schema max
    const s = norm({
      schemaVersion: "1", idempotencyKey: "overflow-key-1",
      member: { memberNumber: "M" }, provider: {},
      encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
      diagnoses: [{ code: "J06.9", isPrimary: true }],
      lines: [{ serviceCategory: "OTHER", description: "svc", quantity: 1, unitCost: big, billedAmount: big }],
      currency: "UGX",
    });
    expect(s.lines[0].billedAmount).toBe(big);
    expect(s.totalBilled).toBe(big);
  });

  it("canonicalDecimal rejects NaN / Infinity / exponent (defence in depth)", () => {
    expect(() => canonicalDecimal(Number.NaN)).toThrow();
    expect(() => canonicalDecimal(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalDecimal("1e9")).toThrow();
  });
});

describe("F1.2 — text, code and date normalizers", () => {
  it("collapses whitespace and preserves meaningful text", () => {
    expect(normalizeText("  GP   consultation ")).toBe("GP consultation");
    expect(normalizeText("ward\t+\nreview")).toBe("ward + review");
  });

  it("uppercases codes without inventing them", () => {
    expect(normalizeCode("j06.9")).toBe("J06.9");
    expect(normalizeCode("  99213 ")).toBe("99213");
    expect(normalizeCode(undefined)).toBeNull();
    expect(normalizeCode("   ")).toBeNull();
  });

  it("normalizes calendar dates and instants by field semantics", () => {
    expect(normalizeCalendarDate("2026-06-01")).toBe("2026-06-01");
    expect(normalizeCalendarDate("2026-06-01T10:00:00Z")).toBe("2026-06-01");
    expect(normalizeInstant("2026-06-01T09:30:00Z")).toBe("2026-06-01T09:30:00.000Z");
    expect(normalizeInstant(null)).toBeNull();
  });
});

describe("F1.2 — line ordering by source reference", () => {
  const base = {
    schemaVersion: "1", idempotencyKey: "order-key-000001",
    member: { memberNumber: "M" }, provider: {},
    encounter: { serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", serviceFrom: "2026-06-01" },
    diagnoses: [{ code: "J06.9", isPrimary: true }],
    currency: "UGX",
  };
  const lineA = { serviceCategory: "CONSULTATION", description: "A", quantity: 1, unitCost: "1000", billedAmount: "1000" };
  const lineB = { serviceCategory: "LABORATORY", description: "B", quantity: 1, unitCost: "2000", billedAmount: "2000" };

  it("with source refs, different input order yields the SAME canonical order", () => {
    const forward = norm({ ...base, idempotencyKey: "order-fwd-0001", lines: [{ ...lineA, sourceLineRef: "L1" }, { ...lineB, sourceLineRef: "L2" }] });
    const reversed = norm({ ...base, idempotencyKey: "order-rev-0001", lines: [{ ...lineB, sourceLineRef: "L2" }, { ...lineA, sourceLineRef: "L1" }] });
    expect(reversed.lines.map((l) => l.description)).toEqual(["A", "B"]);
    expect(forward.lines.map((l) => l.description)).toEqual(["A", "B"]);
  });

  it("without source refs, input order is preserved (different order ⇒ different canonical)", () => {
    const forward = norm({ ...base, idempotencyKey: "order-nf-fwd-1", lines: [lineA, lineB] });
    const reversed = norm({ ...base, idempotencyKey: "order-nf-rev-1", lines: [lineB, lineA] });
    expect(forward.lines.map((l) => l.description)).toEqual(["A", "B"]);
    expect(reversed.lines.map((l) => l.description)).toEqual(["B", "A"]);
  });
});

describe("F1.2 — normalizes every golden scenario without error", () => {
  it("produces a canonical object with recomputed totals for all fixtures", async () => {
    const { GOLDEN_SCENARIOS } = await import("../fixtures/claims-autopilot");
    for (const sc of GOLDEN_SCENARIOS) {
      const n = norm(sc.submission);
      // total equals the sum of normalized line billed amounts
      const sum = n.lines.reduce((s, l) => s + Number(l.billedAmount), 0);
      expect(Number(n.totalBilled)).toBeCloseTo(sum, 2);
    }
  });
});
