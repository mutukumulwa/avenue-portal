/**
 * Claims Autopilot F4.4 — AutoDecisionPlan conservation + serialization (unit).
 */
import { describe, it, expect } from "vitest";
import { validatePlanConservation, type AutoDecisionPlan, type PlanLine } from "@/server/services/claim-autopilot/plan";

const line = (over: Partial<PlanLine>): PlanLine => ({
  claimLineId: "l1", decision: "APPROVED", billedAmount: "1000.00", contractedAmount: "1000.00", payableAmount: "1000.00",
  shortfallAmount: "0.00", disallowedAmount: "0.00", memberLiability: "0.00", payerLiability: "1000.00", providerWriteOff: "0.00",
  reasonCode: "APPROVED", resubmissionAllowed: false, ...over,
});

const plan = (over: Partial<AutoDecisionPlan>): AutoDecisionPlan => ({
  workflowVersion: "v1", claimId: "c1", claimRevision: 1, evaluatedAt: new Date().toISOString(),
  mode: "LIVE", policyId: "p1", policyVersion: null, disposition: "APPROVE", action: "APPROVED",
  totalBilled: "1000.00", totalPayable: "1000.00", currency: "UGX", reasons: [], lines: [line({})],
  snapshots: { claimUpdatedAt: new Date().toISOString(), contractVersionIds: [], eligibilityAsOf: new Date().toISOString() },
  ...over,
});

describe("F4.4 — conservation invariants", () => {
  it("a clean full-approval plan conserves", () => {
    expect(validatePlanConservation(plan({}))).toEqual({ valid: true, errors: [] });
  });

  it("an adjustment (payable < billed) conserves via provider write-off", () => {
    const p = plan({
      disposition: "PARTIAL", action: "PARTIALLY_APPROVED", totalBilled: "1000.00", totalPayable: "800.00",
      lines: [line({ decision: "APPROVED_WITH_ADJUSTMENT", payableAmount: "800.00", payerLiability: "800.00", providerWriteOff: "200.00", contractedAmount: "800.00", reasonCode: "APPROVED_WITH_ADJUSTMENT" })],
    });
    expect(validatePlanConservation(p).valid).toBe(true);
  });

  it("flags a line whose parts do not sum to billed", () => {
    const p = plan({ lines: [line({ payerLiability: "900.00", providerWriteOff: "0.00" })] }); // 900 + 0 != 1000
    const r = validatePlanConservation(p);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /billed .* != payer/.test(e))).toBe(true);
  });

  it("flags a total-payable mismatch", () => {
    const p = plan({ totalPayable: "999.00" });
    expect(validatePlanConservation(p).valid).toBe(false);
  });

  it("a routed plan pays nothing and needs a reason on each pended line", () => {
    const routed = plan({
      disposition: "ROUTE", action: undefined, totalPayable: "0.00", routeCode: "FRAUD_REVIEW",
      lines: [line({ decision: "PENDED", payableAmount: "0.00", payerLiability: "0.00", providerWriteOff: "0.00", contractedAmount: "0.00", reasonCode: "FRAUD_REVIEW" })],
    });
    expect(validatePlanConservation(routed)).toEqual({ valid: true, errors: [] });
    // a routed plan with non-zero payable is invalid
    expect(validatePlanConservation(plan({ disposition: "ROUTE", totalPayable: "10.00" })).valid).toBe(false);
    // a pended line with no reason is invalid
    const noReason = plan({ disposition: "ROUTE", totalPayable: "0.00", lines: [line({ decision: "PENDED", reasonCode: "", payerLiability: "0.00", payableAmount: "0.00", providerWriteOff: "0.00" })] });
    expect(validatePlanConservation(noReason).valid).toBe(false);
  });
});

describe("F4.4 — serialization", () => {
  it("round-trips through JSON with all money as decimal strings", () => {
    const p = plan({});
    const round = JSON.parse(JSON.stringify(p)) as AutoDecisionPlan;
    expect(round).toEqual(p);
    for (const l of round.lines) {
      for (const f of ["billedAmount", "payableAmount", "payerLiability", "memberLiability", "providerWriteOff", "disallowedAmount"] as const) {
        expect(typeof l[f]).toBe("string");
        expect(l[f]).toMatch(/^\d+\.\d{2}$/);
      }
    }
    expect(typeof round.totalBilled).toBe("string");
    expect(typeof round.totalPayable).toBe("string");
  });
});
