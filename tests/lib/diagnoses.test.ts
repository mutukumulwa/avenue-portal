/**
 * ELIG-GAP-023 — diagnosis JSON has two persisted shapes: Claim.diagnoses uses
 * `icdCode`, PreAuthorization.diagnoses uses `code`. The normaliser must read the
 * code from EITHER shape so no reader renders a blank code.
 */
import { describe, it, expect } from "vitest";
import { diagnosisCodeOf } from "@/lib/diagnoses";

describe("diagnosisCodeOf", () => {
  it("reads the Claim shape (icdCode)", () => {
    expect(diagnosisCodeOf({ icdCode: "A09", description: "Gastroenteritis" })).toBe("A09");
  });

  it("reads the PreAuthorization shape (code)", () => {
    expect(diagnosisCodeOf({ code: "A09", description: "Gastroenteritis" })).toBe("A09");
  });

  it("prefers icdCode when both are present, and returns undefined when neither is", () => {
    expect(diagnosisCodeOf({ icdCode: "A09", code: "B10" })).toBe("A09");
    expect(diagnosisCodeOf({ description: "no code" })).toBeUndefined();
    expect(diagnosisCodeOf({ icdCode: null, code: null })).toBeUndefined();
  });
});
