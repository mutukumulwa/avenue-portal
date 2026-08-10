import { describe, it, expect } from "vitest";
import {
  cptTariffSchema,
  diagnosisTariffSchema,
  addTariffSchema,
  detectTariffOverlap,
  tariffRate,
  type TariffOverlapView,
} from "@/lib/validation/tariff";

/**
 * WP-N1 (N-009) — the tariff rate + effective window are validated at the
 * canonical boundary both doors (server action + tRPC) share. WP-N2 (N-010) —
 * write-time overlap detection.
 */

describe("tariffRate — the N-009 boundary", () => {
  it("rejects zero, negative, NaN and Infinity; accepts a positive amount", () => {
    expect(tariffRate.safeParse(0).success).toBe(false);
    expect(tariffRate.safeParse(-1).success).toBe(false);
    expect(tariffRate.safeParse("not-a-number").success).toBe(false); // coerces to NaN
    expect(tariffRate.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(tariffRate.safeParse(2500).success).toBe(true);
    expect(tariffRate.safeParse("2500.50").success).toBe(true);
  });
});

describe("cptTariffSchema", () => {
  const base = { serviceName: "Consultation", agreedRate: "2500", currency: "UGX", effectiveFrom: "2026-01-01" };

  it("accepts a valid tariff", () => {
    expect(cptTariffSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero rate with an agreedRate field error", () => {
    const r = cptTariffSchema.safeParse({ ...base, agreedRate: "0" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.agreedRate).toBeTruthy();
  });

  it("rejects negative and non-numeric rates", () => {
    expect(cptTariffSchema.safeParse({ ...base, agreedRate: "-5" }).success).toBe(false);
    expect(cptTariffSchema.safeParse({ ...base, agreedRate: "abc" }).success).toBe(false);
  });

  it("rejects an effectiveTo that is not after effectiveFrom", () => {
    const r = cptTariffSchema.safeParse({ ...base, effectiveTo: "2025-12-31" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.effectiveTo).toBeTruthy();
  });

  it("accepts an ordered effective window", () => {
    expect(cptTariffSchema.safeParse({ ...base, effectiveTo: "2026-12-31" }).success).toBe(true);
  });

  it("requires a service name", () => {
    expect(cptTariffSchema.safeParse({ ...base, serviceName: "  " }).success).toBe(false);
  });
});

describe("diagnosisTariffSchema", () => {
  const base = { icdCode: "B54", diagnosisLabel: "Malaria", effectiveFrom: "2026-01-01" };

  it("requires at least one of bundled / per-day rate", () => {
    const r = diagnosisTariffSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.bundledRate).toBeTruthy();
  });

  it("accepts a positive bundled rate; rejects a zero one", () => {
    expect(diagnosisTariffSchema.safeParse({ ...base, bundledRate: "8000" }).success).toBe(true);
    expect(diagnosisTariffSchema.safeParse({ ...base, bundledRate: "0" }).success).toBe(false);
  });

  it("rejects a negative per-day rate", () => {
    expect(diagnosisTariffSchema.safeParse({ ...base, perDayRate: "-100" }).success).toBe(false);
  });
});

describe("addTariffSchema (tRPC door) enforces the same rules + providerId", () => {
  it("rejects a missing providerId, a zero rate and a reversed window; accepts a valid input", () => {
    expect(addTariffSchema.safeParse({ serviceName: "X", agreedRate: 100, effectiveFrom: "2026-01-01" }).success).toBe(false);
    expect(addTariffSchema.safeParse({ providerId: "p1", serviceName: "X", agreedRate: 0, effectiveFrom: "2026-01-01" }).success).toBe(false);
    expect(addTariffSchema.safeParse({ providerId: "p1", serviceName: "X", agreedRate: 100, effectiveFrom: "2026-06-01", effectiveTo: "2026-01-01" }).success).toBe(false);
    expect(addTariffSchema.safeParse({ providerId: "p1", serviceName: "X", agreedRate: 100, effectiveFrom: "2026-01-01" }).success).toBe(true);
  });
});

describe("detectTariffOverlap — N-010", () => {
  const d = (s: string) => new Date(s);
  const existing: TariffOverlapView[] = [
    { id: "t1", cptCode: "99213", serviceName: "Consult", clientId: null, contractId: null, effectiveFrom: d("2026-01-01"), effectiveTo: d("2026-06-30"), isActive: true },
  ];

  it("flags an overlapping window for the same code + scope", () => {
    const hit = detectTariffOverlap(existing, {
      cptCode: "99213", serviceName: "Consult", clientId: null, contractId: null, effectiveFrom: d("2026-03-01"), effectiveTo: null,
    });
    expect(hit?.id).toBe("t1");
  });

  it("allows a prospective (non-overlapping) replacement window", () => {
    expect(
      detectTariffOverlap(existing, { cptCode: "99213", serviceName: "Consult", clientId: null, contractId: null, effectiveFrom: d("2026-07-01"), effectiveTo: null }),
    ).toBeNull();
  });

  it("does not treat a per-client rate as overlapping the network master", () => {
    expect(
      detectTariffOverlap(existing, { cptCode: "99213", serviceName: "Consult", clientId: "cli1", contractId: null, effectiveFrom: d("2026-03-01"), effectiveTo: null }),
    ).toBeNull();
  });

  it("ignores inactive rows and the row being edited (same id)", () => {
    expect(
      detectTariffOverlap([{ ...existing[0], isActive: false }], { cptCode: "99213", serviceName: "Consult", clientId: null, contractId: null, effectiveFrom: d("2026-03-01"), effectiveTo: null }),
    ).toBeNull();
    expect(
      detectTariffOverlap(existing, { id: "t1", cptCode: "99213", serviceName: "Consult", clientId: null, contractId: null, effectiveFrom: d("2026-03-01"), effectiveTo: null }),
    ).toBeNull();
  });

  it("matches CPT-less rows by normalized service name", () => {
    const noCode: TariffOverlapView[] = [{ id: "t2", cptCode: null, serviceName: "Ward Fee", clientId: null, contractId: null, effectiveFrom: d("2026-01-01"), effectiveTo: null, isActive: true }];
    expect(
      detectTariffOverlap(noCode, { cptCode: null, serviceName: " ward fee ", clientId: null, contractId: null, effectiveFrom: d("2026-02-01"), effectiveTo: null }),
    ).not.toBeNull();
  });
});
