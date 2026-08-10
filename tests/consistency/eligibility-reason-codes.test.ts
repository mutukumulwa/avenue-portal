import { describe, it, expect } from "vitest";
import {
  ELIGIBILITY_ORACLE_REASON_CODES,
  ELIGIBILITY_EXCLUSION_REASON_CODES,
  ELIGIBILITY_REASON_CODES,
  isEligibilityReasonCode,
} from "@/server/services/eligibility/reason-codes";

/**
 * SP-8 drift detector — the eligibility evaluator's reason-code enum must equal
 * the published oracle list (EO-001..024) plus the Wave 2 exclusion additions,
 * with NO strays. Locked verbatim to plan §SP-6 line 156.
 */

const ORACLE = [
  "ACTIVE",
  "POLICY_NOT_STARTED",
  "NOT_YET_ENROLLED",
  "WAITING_PERIOD",
  "SUSPENDED",
  "ACTIVE_AS_OF_SERVICE_DATE",
  "TERMINATED",
  "LAPSED",
  "COVERAGE_GAP",
  "REINSTATED",
  "AGE_BOUNDARY",
  "OVER_AGE_DEPENDANT",
  "LIMIT_EXHAUSTED",
  "PROVIDER_EXCLUDED",
  "MISSING_REFERRAL",
  "EMERGENCY_REFERRAL_EXCEPTION",
  "RENEWAL_VERSION",
  "NOT_FOUND",
];

describe("eligibility reason-code enum", () => {
  it("oracle base matches the published list exactly, in order", () => {
    expect([...ELIGIBILITY_ORACLE_REASON_CODES]).toEqual(ORACLE);
  });

  it("Wave 2 adds exactly the two exclusion codes", () => {
    expect([...ELIGIBILITY_EXCLUSION_REASON_CODES]).toEqual(["TREATMENT_EXCLUDED", "EXPERIMENTAL_EXCLUDED"]);
  });

  it("the full enum = oracle ∪ exclusion codes, no strays", () => {
    expect([...ELIGIBILITY_REASON_CODES]).toEqual([...ORACLE, "TREATMENT_EXCLUDED", "EXPERIMENTAL_EXCLUDED"]);
  });

  it("has no duplicates", () => {
    expect(new Set(ELIGIBILITY_REASON_CODES).size).toBe(ELIGIBILITY_REASON_CODES.length);
  });

  it("includes the referral + exclusion codes the evaluators emit", () => {
    for (const code of [
      "MISSING_REFERRAL",
      "EMERGENCY_REFERRAL_EXCEPTION",
      "TREATMENT_EXCLUDED",
      "EXPERIMENTAL_EXCLUDED",
    ]) {
      expect(isEligibilityReasonCode(code)).toBe(true);
    }
  });

  it("rejects a non-member code", () => {
    expect(isEligibilityReasonCode("DEFINITELY_NOT_A_CODE")).toBe(false);
  });
});
