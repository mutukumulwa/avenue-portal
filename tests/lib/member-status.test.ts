/**
 * WP-3.5G — the member lifecycle state machine. The general edit dropdown may
 * only perform governed transitions; terminal states are locked (reinstatement /
 * re-termination go through the dedicated flows), and each transition names a
 * DISTINCT audit action.
 */
import { describe, it, expect } from "vitest";
import {
  isTerminalMemberStatus,
  canEditTransition,
  editStatusOptions,
  memberTransitionAuditAction,
  TERMINAL_MEMBER_STATUSES,
} from "@/lib/member-status";

describe("isTerminalMemberStatus", () => {
  it("flags every coverage-ended terminal status", () => {
    for (const s of TERMINAL_MEMBER_STATUSES) expect(isTerminalMemberStatus(s)).toBe(true);
    expect(isTerminalMemberStatus("TERMINATED_FRAUD")).toBe(true);
    expect(isTerminalMemberStatus("CANCELLED_COOLING_OFF")).toBe(true);
  });
  it("does not flag ACTIVE / SUSPENDED / PENDING / LAPSED", () => {
    for (const s of ["ACTIVE", "SUSPENDED", "PENDING_ACTIVATION", "LAPSED"]) {
      expect(isTerminalMemberStatus(s)).toBe(false);
    }
  });
});

describe("canEditTransition — edit-dropdown lockdown", () => {
  it("BLOCKS terminal → active (reinstatement is a governed flow)", () => {
    expect(canEditTransition("TERMINATED", "ACTIVE")).toBe(false);
    expect(canEditTransition("TERMINATED_FRAUD", "ACTIVE")).toBe(false);
    expect(canEditTransition("EXPIRED", "ACTIVE")).toBe(false);
  });
  it("BLOCKS terminal → re-termination", () => {
    expect(canEditTransition("TERMINATED", "TERMINATED")).toBe(true); // same-status no-op is allowed
    expect(canEditTransition("TERMINATED", "LAPSED")).toBe(false);
    expect(canEditTransition("TERMINATED_DEATH", "TERMINATED")).toBe(false);
  });
  it("ALLOWS the governed edit transitions", () => {
    expect(canEditTransition("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canEditTransition("SUSPENDED", "ACTIVE")).toBe(true); // suspension reinstatement
    expect(canEditTransition("ACTIVE", "TERMINATED")).toBe(true);
    expect(canEditTransition("PENDING_ACTIVATION", "ACTIVE")).toBe(true);
  });
  it("ALLOWS a same-status edit (plain profile edit) from any state", () => {
    expect(canEditTransition("ACTIVE", "ACTIVE")).toBe(true);
    expect(canEditTransition("TERMINATED_FRAUD", "TERMINATED_FRAUD")).toBe(true);
  });
  it("does NOT allow LAPSED → ACTIVE from the dropdown (governed reinstatement)", () => {
    expect(canEditTransition("LAPSED", "ACTIVE")).toBe(false);
  });
});

describe("editStatusOptions — what the dropdown offers", () => {
  it("offers the current status plus its allowed targets", () => {
    expect(editStatusOptions("ACTIVE")).toEqual(["ACTIVE", "SUSPENDED", "LAPSED", "TERMINATED"]);
    expect(editStatusOptions("SUSPENDED")).toEqual(["ACTIVE", "SUSPENDED", "LAPSED", "TERMINATED"]);
  });
});

describe("memberTransitionAuditAction — a distinct action per transition", () => {
  it("names each lifecycle transition distinctly", () => {
    expect(memberTransitionAuditAction("ACTIVE", "SUSPENDED")).toBe("MEMBER_SUSPENDED");
    expect(memberTransitionAuditAction("SUSPENDED", "ACTIVE")).toBe("MEMBER_REINSTATED");
    expect(memberTransitionAuditAction("PENDING_ACTIVATION", "ACTIVE")).toBe("MEMBER_ACTIVATED");
    expect(memberTransitionAuditAction("ACTIVE", "LAPSED")).toBe("MEMBER_LAPSED");
    expect(memberTransitionAuditAction("ACTIVE", "TERMINATED")).toBe("MEMBER_TERMINATED");
  });
  it("keeps a pure profile edit (no status change) as MEMBER_UPDATED", () => {
    expect(memberTransitionAuditAction("ACTIVE", "ACTIVE")).toBe("MEMBER_UPDATED");
  });
});
