/**
 * F6.10 — payment-query policy + provider-safe projection (pure; always runs).
 */
import { describe, it, expect } from "vitest";
import {
  canTransitionPaymentQuery,
  PAYMENT_QUERY_TRANSITIONS,
  PAYMENT_QUERY_TERMINAL,
  PROVIDER_WITHDRAWABLE,
  isPaymentQueryTerminal,
  toProviderPaymentQueryProjection,
  toProviderPaymentQueryTimeline,
  type PaymentQueryRow,
} from "@/server/services/provider-payment-query/policy";

describe("F6.10 payment-query transitions", () => {
  it("permits the finance/provider collaboration lifecycle", () => {
    expect(canTransitionPaymentQuery("OPEN", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionPaymentQuery("ACKNOWLEDGED", "INFORMATION_REQUIRED")).toBe(true);
    expect(canTransitionPaymentQuery("INFORMATION_REQUIRED", "PROVIDER_RESPONDED")).toBe(true);
    expect(canTransitionPaymentQuery("PROVIDER_RESPONDED", "RESOLVED")).toBe(true);
  });
  it("forbids resolving straight from OPEN and resurrecting a terminal query", () => {
    expect(canTransitionPaymentQuery("OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionPaymentQuery("WITHDRAWN", "OPEN")).toBe(false);
    expect(canTransitionPaymentQuery("RESOLVED", "OPEN")).toBe(false);
  });
  it("terminal + withdrawable sets", () => {
    expect(PAYMENT_QUERY_TERMINAL).toEqual(["WITHDRAWN", "CLOSED"]);
    expect(PAYMENT_QUERY_TRANSITIONS.WITHDRAWN).toEqual([]);
    expect(isPaymentQueryTerminal("CLOSED")).toBe(true);
    expect(PROVIDER_WITHDRAWABLE).not.toContain("RESOLVED");
  });
});

describe("F6.10 provider-safe projection", () => {
  const row: PaymentQueryRow = {
    id: "q1", settlementBatchId: "b1", claimId: "c1", claimLineId: null, disbursementId: null,
    category: "SHORT_PAYMENT", discrepancyAmount: 250, discrepancyCurrency: "UGX", providerNarrative: "Short paid",
    status: "RESOLVED", dueAt: null, resolutionCode: "ADJUSTED", resolutionExplanation: "Corrected on next cycle.", linkedReconsiderationId: null, createdAt: new Date(),
    assignedReviewerId: "reviewer-x", assignedTeam: "FINANCE", resolutionInternalNote: "internal only",
  };
  it("drops internal owner/note; keeps the safe explanation", () => {
    const safe = toProviderPaymentQueryProjection(row) as unknown as Record<string, unknown>;
    expect(safe.assignedReviewerId).toBeUndefined();
    expect(safe.assignedTeam).toBeUndefined();
    expect(safe.resolutionInternalNote).toBeUndefined();
    expect(safe.resolutionExplanation).toBe("Corrected on next cycle.");
    expect(safe.narrative).toBe("Short paid");
    expect(safe.discrepancyAmount).toBe("250");
  });
  it("timeline surfaces only SHARED messages", () => {
    const t = toProviderPaymentQueryTimeline([
      { audience: "SHARED", eventType: "RAISED", body: "hi", createdAt: new Date() },
      { audience: "INTERNAL", eventType: "MESSAGE", body: "secret", createdAt: new Date() },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].eventType).toBe("RAISED");
  });
});
