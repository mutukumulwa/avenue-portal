import { describe, it, expect } from "vitest";
import {
  MEMBER_STATUSES,
  LIFECYCLE_POLICY,
  TERMINAL_STATUSES,
  policyFor,
  evaluateTransition,
  describeEffect,
  type LifecycleCommand,
  type MemberStatusValue,
} from "@/lib/member-lifecycle-policy";

/**
 * UAT-HF P07.01 — the lifecycle policy table.
 *
 * Acceptance: "table-driven test covers **every** from/to pair, including
 * forbidden same-form and stale transitions."
 *
 * The defects behind it are one shape repeated — lifecycle changes as
 * fragmented direct actions, each screen with its own idea of what was allowed.
 * DEF-040 is the sharpest: "Standard Cancel" terminating a member on one
 * unconfirmed click, from the same form used to correct a spelling.
 *
 * So these iterate all 11 × 11 pairs. A pair that nobody thought about is a
 * pair that fails open, and the only way to know is to enumerate them.
 */

const CMD = (over: Partial<LifecycleCommand> = {}): LifecycleCommand => ({
  memberId: "m1",
  fromStatus: "ACTIVE",
  fromVersion: 3,
  toStatus: "SUSPENDED",
  reasonNote: "Contributions in arrears",
  lastCoveredDay: "2026-08-31",
  requestedAt: new Date("2026-08-13T00:00:00Z"),
  makerId: "u_maker",
  makerRole: "MEMBER_OPS",
  checkerId: "u_checker",
  idempotencyKey: "idem_1",
  ...over,
});

const CTX = (over: Partial<Parameters<typeof evaluateTransition>[1]> = {}) => ({
  channel: "GOVERNED_FLOW" as const,
  currentStatus: "ACTIVE" as MemberStatusValue,
  currentVersion: 3,
  ...over,
});

describe("P07.01 every from/to pair has a defined answer", () => {
  it("covers all 121 pairs without throwing", () => {
    const answered: string[] = [];
    for (const from of MEMBER_STATUSES) {
      for (const to of MEMBER_STATUSES) {
        const decision = evaluateTransition(
          CMD({ fromStatus: from, toStatus: to }),
          CTX({ currentStatus: from }),
        );
        // Total, not partial: an evaluator that throws on an unexpected pair is
        // one that fails open somewhere upstream.
        expect(typeof decision.allowed).toBe("boolean");
        answered.push(`${from}->${to}`);
      }
    }
    expect(answered.length).toBe(MEMBER_STATUSES.length ** 2);
  });

  it("refuses every pair the table does not list", () => {
    const wrongly: string[] = [];
    for (const from of MEMBER_STATUSES) {
      for (const to of MEMBER_STATUSES) {
        if (from === to) continue;
        const listed = !!policyFor(from, to);
        const decision = evaluateTransition(
          CMD({ fromStatus: from, toStatus: to, makerRole: "SUPER_ADMIN" }),
          CTX({ currentStatus: from }),
        );
        if (!listed && decision.allowed) wrongly.push(`${from}->${to} allowed but not in the table`);
      }
    }
    expect(wrongly).toEqual([]);
  });

  it("refuses a no-op rather than recording a transition that did not happen", () => {
    for (const status of MEMBER_STATUSES) {
      const d = evaluateTransition(
        CMD({ fromStatus: status, toStatus: status }),
        CTX({ currentStatus: status }),
      );
      expect(d.allowed).toBe(false);
    }
  });
});

describe("P07.01 terminal statuses are terminal", () => {
  it("identifies exactly the statuses nothing leaves", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      [
        "CANCELLED_COOLING_OFF",
        "EXPIRED",
        "LAPSED_BEFORE_ACTIVATION",
        "TERMINATED",
        "TERMINATED_BREACH",
        "TERMINATED_DEATH",
        "TERMINATED_FRAUD",
      ].sort(),
    );
  });

  it("refuses every transition out of one, to every target", () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of MEMBER_STATUSES) {
        if (from === to) continue;
        const d = evaluateTransition(
          CMD({ fromStatus: from, toStatus: to, makerRole: "SUPER_ADMIN" }),
          CTX({ currentStatus: from }),
        );
        expect(d.allowed, `${from}->${to} should be refused`).toBe(false);
        if (!d.allowed) expect(d.refusal).toBe("TERMINAL");
      }
    }
  });

  it("does not offer a reinstatement path that bypasses the governed flow", () => {
    // A table that let TERMINATED become ACTIVE would silently skip the
    // catch-up window and waiting-period preservation that reinstatement owns.
    expect(policyFor("TERMINATED", "ACTIVE")).toBeUndefined();
    expect(policyFor("TERMINATED_FRAUD", "ACTIVE")).toBeUndefined();
  });
});

describe("P07.01 forbidden same-form transitions (DEF-040)", () => {
  it("termination cannot be performed from the profile form", () => {
    // The defect exactly: a dropdown value beside "correct a spelling",
    // committed by the same Save button.
    const d = evaluateTransition(
      CMD({ toStatus: "TERMINATED" }),
      CTX({ channel: "EDIT_FORM" }),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.refusal).toBe("WRONG_CHANNEL");
      expect(d.message).toMatch(/cannot be made from the profile form/i);
    }
  });

  it("every cover-ending transition is GOVERNED_FLOW only", () => {
    const leaks = LIFECYCLE_POLICY.filter((p) => p.endsCover && p.channel === "EDIT_FORM").map(
      (p) => `${p.from}->${p.to}`,
    );
    // Except lapse, which the edit form has always been able to record and
    // which is reversible through its own flow — asserted explicitly so the
    // exception is a decision rather than an oversight.
    expect(leaks).toEqual(["ACTIVE->LAPSED", "SUSPENDED->LAPSED"]);
  });

  it("suspension IS allowed from the edit form", () => {
    // Not everything needs a ceremony. Suspension is reversible and does not
    // end cover, so gating it behind a governed flow would train operators to
    // treat the ceremony as noise.
    const d = evaluateTransition(CMD({ toStatus: "SUSPENDED" }), CTX({ channel: "EDIT_FORM" }));
    expect(d.allowed).toBe(true);
  });
});

describe("P07.01 stale transitions", () => {
  it("refuses when the member has moved since the view loaded", () => {
    const d = evaluateTransition(
      CMD({ fromStatus: "ACTIVE", toStatus: "SUSPENDED" }),
      CTX({ currentStatus: "LAPSED" }),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("STALE");
  });

  it("refuses when the version has moved even though the status has not", () => {
    // Two operators reading the same ACTIVE member and both acting: the status
    // check alone would let the second through.
    const d = evaluateTransition(CMD({ fromVersion: 3 }), CTX({ currentVersion: 4 }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("STALE");
  });

  it("checks staleness before anything else", () => {
    // A stale command that is ALSO missing a reason must report staleness:
    // telling the operator to add a reason invites them to retry a command
    // that can never apply.
    const d = evaluateTransition(
      CMD({ reasonNote: "", toStatus: "SUSPENDED" }),
      CTX({ currentStatus: "LAPSED" }),
    );
    if (!d.allowed) expect(d.refusal).toBe("STALE");
  });
});

describe("P07.01 reason, role and approval", () => {
  it("requires a reason where the policy says so", () => {
    const d = evaluateTransition(CMD({ toStatus: "SUSPENDED", reasonNote: "", reasonCode: "" }), CTX());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("REASON_REQUIRED");
  });

  it("accepts a reason code in place of free text", () => {
    const d = evaluateTransition(
      CMD({ toStatus: "SUSPENDED", reasonNote: "", reasonCode: "ARREARS" }),
      CTX(),
    );
    expect(d.allowed).toBe(true);
  });

  it("refuses a role the policy does not name", () => {
    const d = evaluateTransition(CMD({ toStatus: "TERMINATED_FRAUD", makerRole: "MEMBER_OPS" }), CTX());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("ROLE_NOT_PERMITTED");
  });

  it("requires a checker on termination", () => {
    const d = evaluateTransition(CMD({ toStatus: "TERMINATED", checkerId: undefined }), CTX());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("APPROVAL_REQUIRED");
  });

  it("refuses self-approval (DEC-03)", () => {
    // A maker who can also check is one person wearing two hats.
    const d = evaluateTransition(
      CMD({ toStatus: "TERMINATED", makerId: "u1", checkerId: "u1" }),
      CTX(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("SELF_APPROVAL");
  });

  it("does not require a checker for a death termination", () => {
    // Delaying it leaves cover open on a deceased member and asks a family to
    // wait for a second signature.
    const d = evaluateTransition(
      CMD({ toStatus: "TERMINATED_DEATH", checkerId: undefined }),
      CTX(),
    );
    expect(d.allowed).toBe(true);
  });

  it("every accusatory termination needs both a senior role and a checker", () => {
    for (const p of LIFECYCLE_POLICY.filter(
      (x) => x.to === "TERMINATED_FRAUD" || x.to === "TERMINATED_BREACH",
    )) {
      // A single operator must not be able to brand a member fraudulent alone.
      expect(p.requiresApproval).toBe(true);
      expect(p.roles).not.toContain("MEMBER_OPS");
    }
  });
});

describe("P07.01 DEC-12 — the last covered day", () => {
  it("refuses a cover-ending transition with no date", () => {
    const d = evaluateTransition(
      CMD({ toStatus: "TERMINATED", lastCoveredDay: "" }),
      CTX(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.refusal).toBe("LAST_COVERED_DAY_REQUIRED");
  });

  it("does not demand one where cover continues", () => {
    const d = evaluateTransition(
      CMD({ toStatus: "SUSPENDED", lastCoveredDay: "" }),
      CTX(),
    );
    expect(d.allowed).toBe(true);
  });

  it("reads the date back inclusively, in words", () => {
    // "termination date" is exactly the field users get wrong, and off by one
    // here is a day of claims.
    const effect = describeEffect(policyFor("ACTIVE", "TERMINATED")!, CMD({ lastCoveredDay: "2026-08-31" }));
    expect(effect).toContain("through 2026-08-31 inclusive");
    expect(effect).toMatch(/not covered from the day after/i);
    expect(effect).toMatch(/still payable/i);
  });

  it("the preview comes from the same policy the decision uses", () => {
    // A sentence computed separately is a sentence that can describe something
    // other than what happens.
    const d = evaluateTransition(CMD({ toStatus: "TERMINATED" }), CTX());
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.effect).toBe(describeEffect(d.policy, CMD({ toStatus: "TERMINATED" })));
  });

  it("suspension explains that cover is not ended", () => {
    const d = evaluateTransition(CMD({ toStatus: "SUSPENDED" }), CTX());
    if (d.allowed) {
      expect(d.effect).toMatch(/not ended/i);
      expect(d.effect).toMatch(/can be restored/i);
    }
  });
});

describe("P07.01 the table itself", () => {
  it("has no duplicate from/to pairs", () => {
    // Two entries for one pair means the answer depends on iteration order —
    // the same class of bug as the provider-rule precedence defect (DEF-054).
    const keys = LIFECYCLE_POLICY.map((p) => `${p.from}->${p.to}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("names a distinct audit action for every kind of transition", () => {
    for (const p of LIFECYCLE_POLICY) {
      expect(p.auditAction).toMatch(/^MEMBER_[A-Z_]+$/);
      // A generic MEMBER_UPDATED for a termination is how a lifecycle event
      // disappears into a sea of profile edits.
      expect(p.auditAction).not.toBe("MEMBER_UPDATED");
    }
  });

  it("gives every transition at least one role that can perform it", () => {
    const unreachable = LIFECYCLE_POLICY.filter((p) => p.roles.length === 0);
    expect(unreachable).toEqual([]);
  });

  it("never lists a terminal status as a source", () => {
    const leaks = LIFECYCLE_POLICY.filter((p) => TERMINAL_STATUSES.includes(p.from));
    expect(leaks).toEqual([]);
  });
});
