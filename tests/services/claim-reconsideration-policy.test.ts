/**
 * F5.11 — pure reconsideration policy: reason eligibility, deadline resolution, the
 * requested/awarded decimal invariants, structural consistency, and the safe-vs-internal
 * provider projection. No DB.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  isReconsiderationReasonEligible,
  RECONSIDERABLE_CLAIM_STATUSES,
  resolveReconsiderationDeadline,
  reconsiderationMaxIncrement,
  validateAwardedIncrement,
  sumAwardedIncrements,
  lineBelongsToClaim,
  providerAndCurrencyConsistent,
  toProviderReconsiderationProjection,
} from "@/server/services/claim-reconsideration/policy";

describe("F5.11 reason eligibility (by decision)", () => {
  it("INCORRECT_DECLINE applies to a DECLINED claim only", () => {
    expect(isReconsiderationReasonEligible("INCORRECT_DECLINE", "DECLINED")).toBe(true);
    expect(isReconsiderationReasonEligible("INCORRECT_DECLINE", "PAID")).toBe(false);
  });
  it("UNDERPAID_RATE applies to partially-approved/approved/paid, not to a full decline", () => {
    expect(isReconsiderationReasonEligible("UNDERPAID_RATE", "PARTIALLY_APPROVED")).toBe(true);
    expect(isReconsiderationReasonEligible("UNDERPAID_RATE", "PAID")).toBe(true);
    expect(isReconsiderationReasonEligible("UNDERPAID_RATE", "DECLINED")).toBe(false);
  });
  it("an unknown reason, or a pre-decision claim, is never eligible", () => {
    expect(isReconsiderationReasonEligible("NONSENSE", "DECLINED")).toBe(false);
    expect(isReconsiderationReasonEligible("OTHER", "RECEIVED")).toBe(false);
    expect(RECONSIDERABLE_CLAIM_STATUSES).not.toContain("RECEIVED");
    expect(RECONSIDERABLE_CLAIM_STATUSES).not.toContain("WITHDRAWN");
  });
});

describe("F5.11 deadline resolution order (UTC, day-inclusive)", () => {
  const decidedAt = new Date("2026-07-01T10:00:00Z");
  it("contract window wins over client over default", () => {
    expect(resolveReconsiderationDeadline({ decidedAt, contractWindowDays: 30, clientWindowDays: 45 }).toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect(resolveReconsiderationDeadline({ decidedAt, contractWindowDays: null, clientWindowDays: 45 }).toISOString()).toBe("2026-08-15T23:59:59.999Z");
    expect(resolveReconsiderationDeadline({ decidedAt }).toISOString()).toBe("2026-08-30T23:59:59.999Z"); // default 60
  });
});

describe("F5.11 requested/awarded decimal invariants", () => {
  it("max increment = corrected entitlement less prior approved/paid, never negative", () => {
    expect(reconsiderationMaxIncrement({ correctedEntitlement: 1000, alreadyApproved: 400, alreadyPaid: 300 }).toFixed(2)).toBe("600.00");
    // uses max(approved, paid) = 900
    expect(reconsiderationMaxIncrement({ correctedEntitlement: 1000, alreadyApproved: 400, alreadyPaid: 900 }).toFixed(2)).toBe("100.00");
    // never negative
    expect(reconsiderationMaxIncrement({ correctedEntitlement: 500, alreadyApproved: 800, alreadyPaid: 800 }).toFixed(2)).toBe("0.00");
  });
  it("awarded increment cannot be negative or exceed the maximum", () => {
    expect(validateAwardedIncrement({ awarded: 500, max: 600 }).ok).toBe(true);
    expect(validateAwardedIncrement({ awarded: 600, max: 600 }).ok).toBe(true);
    expect(validateAwardedIncrement({ awarded: -1, max: 600 })).toEqual({ ok: false, error: expect.stringContaining("negative") });
    expect(validateAwardedIncrement({ awarded: 601, max: 600 })).toEqual({ ok: false, error: expect.stringContaining("exceed") });
  });
  it("the supplemental ceiling is the sum of awarded deltas", () => {
    expect(sumAwardedIncrements([100, "200.50", new Decimal(50)]).toFixed(2)).toBe("350.50");
  });
});

describe("F5.11 structural consistency", () => {
  it("a reconsideration line must belong to the reconsideration's claim", () => {
    expect(lineBelongsToClaim("claim-1", "claim-1")).toBe(true);
    expect(lineBelongsToClaim("claim-2", "claim-1")).toBe(false);
  });
  it("provider + currency must match the disputed claim", () => {
    expect(providerAndCurrencyConsistent({ reconsiderationProviderId: "p1", claimProviderId: "p1", reconsiderationCurrency: "UGX", claimCurrency: "UGX" }).ok).toBe(true);
    expect(providerAndCurrencyConsistent({ reconsiderationProviderId: "p1", claimProviderId: "p2", reconsiderationCurrency: "UGX", claimCurrency: "UGX" })).toEqual({ ok: false, error: expect.stringContaining("provider") });
    expect(providerAndCurrencyConsistent({ reconsiderationProviderId: "p1", claimProviderId: "p1", reconsiderationCurrency: "UGX", claimCurrency: "KES" })).toEqual({ ok: false, error: expect.stringContaining("currency") });
  });
});

describe("F5.11 provider projection excludes internal data", () => {
  it("drops the original adjudicator, internal notes, and reviewer/team", () => {
    const full = {
      id: "r1", status: "UNDER_REVIEW", reasonCode: "INCORRECT_DECLINE", providerNarrative: "n",
      requestedAmount: "500.00", currency: "UGX",
      filingDeadline: new Date("2026-08-01T00:00:00Z"), filedAt: new Date("2026-07-05T00:00:00Z"), dueAt: null,
      outcomeReasonCode: null, outcomeSafeExplanation: null,
      originalAdjudicatorId: "adj-1", outcomeInternalNotes: "internal fraud note", assignedReviewerId: "rev-1", assignedTeam: "integrity",
    };
    const view = toProviderReconsiderationProjection(full);
    expect(view).not.toHaveProperty("originalAdjudicatorId");
    expect(view).not.toHaveProperty("outcomeInternalNotes");
    expect(view).not.toHaveProperty("assignedReviewerId");
    expect(view).not.toHaveProperty("assignedTeam");
    expect(JSON.stringify(view)).not.toMatch(/internal fraud note|integrity|adj-1|rev-1/);
    expect(view.reasonCode).toBe("INCORRECT_DECLINE"); // safe fields preserved
  });
});
