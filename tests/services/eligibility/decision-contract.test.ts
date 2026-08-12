/**
 * UAT-HF P03.02 acceptance — "table-driven tests cover active, future, lapsed,
 * suspended, excluded, out-of-network, waiting, referral, exhausted, stale, and
 * unavailable states."
 *
 * DEF-053's sharpest sentence: "the same string is produced for an unknown
 * member, a malformed input and a real ACTIVE member, [so] out-of-network,
 * not-yet-active and does-not-exist are indistinguishable from each other and
 * from an outage. That indistinguishability is itself part of the defect."
 *
 * These tests pin the distinctions that were missing.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_ELIGIBILITY_DECISION_REASONS,
  COLLAPSED_NOT_FOUND_MESSAGE,
  ELIGIBILITY_REASON_CATALOGUE,
  collapsesOutward,
  isDetermined,
  memberSafeText,
  operatorGuidanceText,
  verdictForReason,
  type EligibilityDecisionReason,
  type EligibilityVerdict,
} from "@/server/services/eligibility/decision-contract";
import { ELIGIBILITY_REASON_CODES } from "@/server/services/eligibility/reason-codes";

describe("P03.02 the catalogue is closed and complete", () => {
  it("covers every reason the base evaluator can produce", () => {
    // A reason with no catalogue entry would render `undefined` at the desk.
    for (const code of ELIGIBILITY_REASON_CODES) {
      expect(ELIGIBILITY_REASON_CATALOGUE[code], code).toBeDefined();
    }
  });

  it.each(ALL_ELIGIBILITY_DECISION_REASONS)("%s has member copy, operator guidance and a verdict", (reason) => {
    const entry = ELIGIBILITY_REASON_CATALOGUE[reason];
    expect(entry.memberSafe.length).toBeGreaterThan(10);
    // DEF-053's message told the operator to "check the card number" for what
    // was a data gap. Every reason must say what to DO.
    expect(entry.operatorGuidance.length).toBeGreaterThan(10);
    expect(verdictForReason(reason)).toBeTruthy();
  });

  it("never leaks an internal term into member-facing copy", () => {
    // The run verified "Controlled source CT-023/024/025" never rendered; that
    // property must hold for this catalogue too.
    for (const reason of ALL_ELIGIBILITY_DECISION_REASONS) {
      const text = memberSafeText(reason);
      expect(text, reason).not.toMatch(/CT-\d|packageVersionId|tenantId|__no_provider_entitlement__|null|undefined/);
    }
  });
});

describe("P03.02 the distinctions DEF-053 said were missing", () => {
  const cases: Array<[string, EligibilityDecisionReason, EligibilityVerdict]> = [
    ["active", "ACTIVE", "ELIGIBLE"],
    ["active dependant", "ACTIVE_DEPENDANT", "ELIGIBLE"],
    ["future / not started", "POLICY_NOT_STARTED", "NOT_ELIGIBLE"],
    ["lapsed", "LAPSED", "NOT_ELIGIBLE"],
    ["suspended", "SUSPENDED", "NOT_ELIGIBLE"],
    ["terminated", "TERMINATED", "NOT_ELIGIBLE"],
    ["treatment excluded", "TREATMENT_EXCLUDED", "BENEFIT_BLOCKED"],
    ["out of network", "OUT_OF_NETWORK", "BENEFIT_BLOCKED"],
    ["provider not entitled", "PROVIDER_NOT_ENTITLED", "BENEFIT_BLOCKED"],
    ["waiting period", "WAITING_PERIOD", "BENEFIT_BLOCKED"],
    ["missing referral", "MISSING_REFERRAL", "BENEFIT_BLOCKED"],
    ["exhausted limit", "LIMIT_EXHAUSTED", "BENEFIT_BLOCKED"],
    ["renewal in progress", "RENEWAL_VERSION", "PENDING_RENEWAL"],
    ["not found", "NOT_FOUND", "NOT_ELIGIBLE"],
    ["system unavailable", "SYSTEM_UNAVAILABLE", "NOT_DETERMINED"],
  ];

  it.each(cases)("%s maps to a distinct verdict", (_label, reason, verdict) => {
    expect(verdictForReason(reason)).toBe(verdict);
  });

  it("gives each state DIFFERENT operator guidance — the core of the defect", () => {
    const distinct = new Set(cases.map(([, reason]) => operatorGuidanceText(reason)));
    // Nine probes in the run produced ONE string. Every one of these must differ.
    expect(distinct.size).toBe(cases.length);
  });

  it("an OUTAGE is never reported as an ineligibility", () => {
    // The single most consequential distinction at the point of care.
    expect(verdictForReason("SYSTEM_UNAVAILABLE")).toBe("NOT_DETERMINED");
    expect(isDetermined("NOT_DETERMINED")).toBe(false);
    expect(isDetermined(verdictForReason("LAPSED"))).toBe(true);
    expect(operatorGuidanceText("SYSTEM_UNAVAILABLE")).toMatch(/not a refusal of cover/i);
  });

  it("tells the operator when the fault is the FACILITY, not the card", () => {
    // DEF-053's message blamed the card for what was a provider-data gap.
    const guidance = operatorGuidanceText("PROVIDER_NOT_ENTITLED");
    expect(guidance).toMatch(/not a problem with the member's card/i);
    expect(guidance).toMatch(/facility/i);
  });
});

describe("P03.02 a blocked benefit does not mean an uncovered member (DEF-058)", () => {
  it.each(["LIMIT_EXHAUSTED", "WAITING_PERIOD", "MISSING_REFERRAL", "TREATMENT_EXCLUDED", "PROVIDER_EXCLUDED"] as const)(
    "%s keeps the member covered",
    (reason) => {
      expect(ELIGIBILITY_REASON_CATALOGUE[reason].memberStillCovered).toBe(true);
    },
  );

  it("says so in the operator guidance for an exhausted limit", () => {
    // E-003 was Blocked because the copy could not distinguish "exhausted" from
    // "not a member".
    const guidance = operatorGuidanceText("LIMIT_EXHAUSTED");
    expect(guidance).toMatch(/cover is active/i);
    expect(memberSafeText("LIMIT_EXHAUSTED")).not.toMatch(/not a member|no cover/i);
  });

  it.each(["LAPSED", "SUSPENDED", "TERMINATED", "OVER_AGE_DEPENDANT"] as const)(
    "%s correctly means the member is NOT covered",
    (reason) => {
      expect(ELIGIBILITY_REASON_CATALOGUE[reason].memberStillCovered).toBe(false);
    },
  );
});

describe("P03.02 privacy collapse preserves the anti-enumeration property", () => {
  it.each(["NOT_FOUND", "OUT_OF_NETWORK", "PROVIDER_NOT_ENTITLED"] as const)(
    "%s collapses to one indistinguishable member-facing string",
    (reason) => {
      expect(collapsesOutward(reason)).toBe(true);
      expect(memberSafeText(reason)).toBe(COLLAPSED_NOT_FOUND_MESSAGE);
    },
  );

  it("but the OPERATOR guidance still differs, so the desk can act", () => {
    // Collapsing is about what is SAID to an unauthorised audience, never about
    // what is recorded or what the authorised operator is told.
    expect(operatorGuidanceText("NOT_FOUND")).not.toBe(operatorGuidanceText("PROVIDER_NOT_ENTITLED"));
    expect(operatorGuidanceText("OUT_OF_NETWORK")).not.toBe(operatorGuidanceText("NOT_FOUND"));
  });

  it("does not collapse a reason that reveals nothing about identity", () => {
    for (const reason of ["ACTIVE", "SUSPENDED", "WAITING_PERIOD", "SYSTEM_UNAVAILABLE"] as const) {
      expect(collapsesOutward(reason), reason).toBe(false);
    }
  });
});
