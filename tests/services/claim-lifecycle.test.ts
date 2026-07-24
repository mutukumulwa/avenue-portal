/** F7.1 — the one claim status transition graph. */
import { describe, it, expect } from "vitest";
import { assertClaimTransition, canTransitionClaim, isTerminalClaimStatus, IllegalClaimTransition, AUTO_DECIDABLE_STATUSES } from "@/server/services/claim-lifecycle";

describe("claim lifecycle graph (F7.1)", () => {
  it("allows the canonical happy paths", () => {
    expect(canTransitionClaim("RECEIVED", "CAPTURED")).toBe(true);
    expect(canTransitionClaim("RECEIVED", "APPROVED")).toBe(true);
    expect(canTransitionClaim("CAPTURED", "DECLINED")).toBe(true);
    expect(canTransitionClaim("UNDER_REVIEW", "PARTIALLY_APPROVED")).toBe(true);
    expect(canTransitionClaim("APPROVED", "PAID")).toBe(true);
    expect(canTransitionClaim("APPROVED", "VOID")).toBe(true);
    expect(canTransitionClaim("DECLINED", "APPEALED")).toBe(true);
    expect(canTransitionClaim("APPEALED", "APPEAL_APPROVED")).toBe(true);
    expect(canTransitionClaim("APPEAL_APPROVED", "PAID")).toBe(true);
  });

  it("refuses illegal backward and terminal moves", () => {
    for (const [from, to] of [
      ["PAID", "APPROVED"], ["PAID", "RECEIVED"], ["PAID", "VOID"],
      ["VOID", "RECEIVED"], ["VOID", "APPROVED"],
      ["APPEAL_DECLINED", "APPEALED"],
      ["APPROVED", "RECEIVED"], ["APPROVED", "UNDER_REVIEW"],
      ["DECLINED", "APPROVED"], // a declined claim re-opens only via appeal
      ["RECEIVED", "PAID"], // money cannot skip the decision
      ["RECEIVED", "VOID"], // nothing to reverse — void applies to decided claims
    ] as const) {
      expect(canTransitionClaim(from, to), `${from}→${to}`).toBe(false);
      expect(() => assertClaimTransition(from, to)).toThrow(IllegalClaimTransition);
    }
  });

  it("re-asserting the same state is an idempotent no-op (repeated pay/void safe)", () => {
    expect(canTransitionClaim("PAID", "PAID")).toBe(true);
    expect(canTransitionClaim("VOID", "VOID")).toBe(true);
    expect(() => assertClaimTransition("PAID", "PAID")).not.toThrow();
  });

  it("terminal states and auto-decidable states are what the pipeline assumes", () => {
    expect(isTerminalClaimStatus("PAID")).toBe(true);
    expect(isTerminalClaimStatus("VOID")).toBe(true);
    expect(isTerminalClaimStatus("APPEAL_DECLINED")).toBe(true);
    expect(isTerminalClaimStatus("RECEIVED")).toBe(false);
    expect(AUTO_DECIDABLE_STATUSES).toEqual(["RECEIVED", "CAPTURED", "UNDER_REVIEW"]);
  });

  it("F5.3: WITHDRAWN + SUPERSEDED are terminal and reachable only from pre-decision states", () => {
    expect(isTerminalClaimStatus("WITHDRAWN")).toBe(true);
    expect(isTerminalClaimStatus("SUPERSEDED")).toBe(true);

    // legal from pre-decision working states
    for (const from of ["RECEIVED", "CAPTURED", "UNDER_REVIEW"] as const) {
      expect(canTransitionClaim(from, "WITHDRAWN"), `${from}→WITHDRAWN`).toBe(true);
      expect(canTransitionClaim(from, "SUPERSEDED"), `${from}→SUPERSEDED`).toBe(true);
    }
    expect(canTransitionClaim("INCURRED", "WITHDRAWN")).toBe(true); // a liability notice can be withdrawn

    // ILLEGAL from decided/settled states — a decided/paid claim can never be silently
    // withdrawn or superseded (must go through void/appeal/reconsideration); and a
    // DECLINED claim stays DECLINED (resubmission LINKS, it does not supersede).
    for (const [from, to] of [
      ["APPROVED", "WITHDRAWN"], ["PARTIALLY_APPROVED", "SUPERSEDED"],
      ["PAID", "WITHDRAWN"], ["PAID", "SUPERSEDED"],
      ["VOID", "WITHDRAWN"], ["DECLINED", "SUPERSEDED"], ["DECLINED", "WITHDRAWN"],
      ["WITHDRAWN", "RECEIVED"], ["SUPERSEDED", "RECEIVED"], // terminal — no exit
    ] as const) {
      expect(canTransitionClaim(from, to), `${from}→${to}`).toBe(false);
      expect(() => assertClaimTransition(from, to)).toThrow(IllegalClaimTransition);
    }
  });
});
