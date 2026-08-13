import { describe, it, expect } from "vitest";
import {
  runPolicyParity,
  CANONICAL_POLICY_CASES,
  type PolicyCase,
} from "@/lib/policy-parity";

/**
 * UAT-HF P03.06 — the policy parity gate.
 *
 * "Run the full canonical eligibility table after package rules are versioned.
 * Release fails if authoring projection, member display, provider decision, and
 * claim/preauth enforcement disagree."
 *
 * The temptation with a gate like this is to define the audience list as
 * whatever currently agrees, which produces a green gate and no information.
 * These tests exist mostly to stop that: the gate must stay red while two of
 * the four audiences do not consult the shared policy read model at all.
 */

describe("P03.06 the canonical table itself", () => {
  it("covers the cases that have previously been got wrong", () => {
    const names = CANONICAL_POLICY_CASES.map((c) => c.name).join(" | ");
    // A month boundary, a leap day, and a non-default basis — arithmetic that
    // has produced off-by-one dates before, plus the 270-day maternity wait the
    // run actually configured.
    expect(names).toMatch(/month end/i);
    expect(names).toMatch(/leap year/i);
    expect(names).toMatch(/dependant/i);
    expect(names).toMatch(/270-day maternity/i);
    // And the two boundaries: no wait, and one already elapsed.
    expect(names).toMatch(/no wait configured/i);
    expect(names).toMatch(/already elapsed/i);
  });
});

describe("P03.06 the audiences that share the read model", () => {
  const { results } = runPolicyParity();
  const by = (name: string) => results.find((r) => r.audience === name)!;

  it("authoring projection answers the whole table correctly", () => {
    expect(by("authoring projection").verdict).toBe("AGREES");
  });

  it("member display answers the whole table correctly", () => {
    expect(by("member display").verdict).toBe("AGREES");
  });

  it("and they answer identically, case by case", () => {
    // If these ever diverge, a maker tells an employer one date and the
    // member's own app shows another — which is the defect P09.07 was written
    // to prevent, so it is worth asserting rather than assuming.
    expect(by("authoring projection").answers).toEqual(by("member display").answers);
  });
});

describe("P03.06 the audiences that do not", () => {
  const { results, mismatches, passed } = runPolicyParity();
  const by = (name: string) => results.find((r) => r.audience === name)!;

  it("the provider decision now answers, and answers the same as the member", () => {
    // Was NOT_CONSULTED: the service performed no waiting-period evaluation at
    // all, so a provider was told cover was active for a benefit the member
    // could not yet use — they treat, and the claim is declined afterwards.
    expect(by("provider decision").verdict).toBe("AGREES");
    expect(by("provider decision").answers).toEqual(by("member display").answers);
  });

  it("reports claim/preauth enforcement as NOT CONSULTED", () => {
    expect(by("claim/preauth enforcement").verdict).toBe("NOT_CONSULTED");
    // It reads a stored date on a different table rather than deriving one from
    // the benefit's configured duration and basis — three sources of truth for
    // one question.
    expect(by("claim/preauth enforcement").note).toMatch(/WaitingPeriodApplication/);
  });

  it("does NOT pass while any audience is unconsulted", () => {
    expect(passed).toBe(false);
    expect(mismatches.length).toBeGreaterThanOrEqual(1);
  });

  it("names all four audiences, so none can be quietly dropped", () => {
    // Narrowing the list is the easy way to make this green, and it is exactly
    // what the gate exists to prevent.
    expect(results.map((r) => r.audience).sort()).toEqual([
      "authoring projection",
      "claim/preauth enforcement",
      "member display",
      "provider decision",
    ]);
  });
});

describe("P03.06 the gate actually detects a disagreement", () => {
  it("fails when an audience answers the wrong date", () => {
    // A gate that cannot go red for the reason it exists is decoration. Feed it
    // a case whose expected answer is deliberately off by one day and confirm
    // both shared-model audiences are reported as disagreeing.
    const sabotaged: PolicyCase[] = [
      {
        name: "off-by-one expectation",
        waitingPeriodDays: 30,
        basis: "COVER_START",
        anchorDate: "2026-01-01",
        asOf: "2026-08-13",
        expectedEligibleFrom: "2026-02-01", // the true answer is 2026-01-31
      },
    ];

    const { results, mismatches } = runPolicyParity(sabotaged);
    for (const a of ["authoring projection", "member display", "provider decision"]) {
      expect(results.find((r) => r.audience === a)!.verdict, a).toBe("DISAGREES");
    }
    expect(mismatches.some((m) => m.includes("2026-01-31"))).toBe(true);
  });

  it("still reports the unconsulted audiences even on a passing table", () => {
    const trivial: PolicyCase[] = [
      {
        name: "no wait",
        waitingPeriodDays: 0,
        basis: "COVER_START",
        anchorDate: "2026-01-01",
        asOf: "2026-08-13",
        expectedEligibleFrom: null,
      },
    ];
    const { passed, mismatches } = runPolicyParity(trivial);
    // Every evaluable audience agrees here, and the gate is still red — which
    // is the correct answer while claim/preauth still never asks.
    expect(passed).toBe(false);
    expect(mismatches.every((m) => m.includes("NOT CONSULTED"))).toBe(true);
  });
});
