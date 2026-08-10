import { describe, it, expect } from "vitest";
import {
  ELIGIBILITY_ORACLE_REASON_CODES,
  ELIGIBILITY_REASON_CODES,
  isEligibilityReasonCode,
} from "@/server/services/eligibility/reason-codes";

/**
 * SP-8 drift detector: the evaluator's oracle reason enum === the distinct
 * "Expected reason/status" values in the published `06 Eligibility Oracle`
 * (EO-001..024), no strays. These are transcribed verbatim from the run workbook
 * so a divergence in either direction fails CI.
 */
const ORACLE_REASONS_FROM_WORKBOOK = [
  "ACTIVE", // EO-001/003/004/007/017(*dependant)/019
  "POLICY_NOT_STARTED", // EO-002
  "RENEWAL_VERSION", // EO-005
  "NOT_YET_ENROLLED", // EO-006
  "WAITING_PERIOD", // EO-008
  "SUSPENDED", // EO-009
  "ACTIVE_AS_OF_SERVICE_DATE", // EO-010
  "TERMINATED", // EO-011
  "LAPSED", // EO-012
  "COVERAGE_GAP", // EO-013
  "REINSTATED", // EO-014
  "AGE_BOUNDARY", // EO-015
  "OVER_AGE_DEPENDANT", // EO-016
  "LIMIT_EXHAUSTED", // EO-018
  "PROVIDER_EXCLUDED", // EO-020
  "MISSING_REFERRAL", // EO-021
  "EMERGENCY_REFERRAL_EXCEPTION", // EO-022
  "ACTIVE_DEPENDANT", // EO-023
  "NOT_FOUND", // EO-024
].sort();

describe("eligibility reason codes match the oracle", () => {
  it("oracle base enum === distinct workbook reason values (no strays)", () => {
    expect([...ELIGIBILITY_ORACLE_REASON_CODES].sort()).toEqual(ORACLE_REASONS_FROM_WORKBOOK);
  });

  it("the closed enum = oracle base ∪ Wave-2 exclusion codes", () => {
    expect(ELIGIBILITY_REASON_CODES).toContain("TREATMENT_EXCLUDED");
    expect(ELIGIBILITY_REASON_CODES).toContain("EXPERIMENTAL_EXCLUDED");
    // exclusion codes are the ONLY additions beyond the oracle base
    const extras = ELIGIBILITY_REASON_CODES.filter(
      (c) => !(ELIGIBILITY_ORACLE_REASON_CODES as readonly string[]).includes(c),
    );
    expect(extras.sort()).toEqual(["EXPERIMENTAL_EXCLUDED", "TREATMENT_EXCLUDED"]);
  });

  it("type guard recognises members and rejects strays", () => {
    expect(isEligibilityReasonCode("ACTIVE_DEPENDANT")).toBe(true);
    expect(isEligibilityReasonCode("NOT_A_CODE")).toBe(false);
  });
});
