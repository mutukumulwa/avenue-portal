/**
 * UAT-HF P07.06 acceptance — "lapsed member cannot invoke protected action
 * through UI or forged request; stale tab cannot restore old state."
 *
 * DEF-058 (S2): "On a FRESHLY loaded profile (not a stale tab) of a member whose
 * status chip reads LAPSED, the page still displayed 'ANNUAL LIMIT (UGX)
 * 25,000,000 / UTILISED (UGX) 0 / REMAINING (UGX) 25,000,000' prominently and
 * still offered New Claim, New Pre-Auth, New Endorsement and Add Dependent ...
 * no warning that the principal is lapsed, no block, no override step. No
 * point-in-time reason and no safe next action is offered for the non-active
 * state anywhere."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MEMBER_ACTION_LABELS,
  canPerformMemberAction,
  limitCaveat,
  limitsAreUsable,
} from "@/lib/member-action-policy";

const ACTIONS = ["CLAIM", "PREAUTH", "ENDORSEMENT", "ADD_DEPENDANT"] as const;

describe("P07.06 an ACTIVE member transacts normally", () => {
  it.each(ACTIONS)("%s is allowed", (action) => {
    const verdict = canPerformMemberAction("ACTIVE", action);
    expect(verdict.allowed).toBe(true);
    // No scolding when nothing is wrong.
    expect(verdict.reason).toBe("");
  });

  it("limits are usable and carry no caveat", () => {
    expect(limitsAreUsable("ACTIVE")).toBe(true);
    expect(limitCaveat("ACTIVE")).toBeNull();
  });
});

describe("P07.06 a LAPSED member cannot transact — the run's exact case", () => {
  it.each(ACTIONS)("%s is refused", (action) => {
    expect(canPerformMemberAction("LAPSED", action).allowed).toBe(false);
  });

  it("says WHY, in point-in-time terms", () => {
    const verdict = canPerformMemberAction("CLAIM", "CLAIM");
    expect(verdict.allowed).toBe(false);
    const lapsed = canPerformMemberAction("LAPSED", "CLAIM");
    expect(lapsed.reason).toMatch(/Cover is not in force/i);
  });

  it("offers a safe next action, which the run found nowhere", () => {
    expect(canPerformMemberAction("LAPSED", "CLAIM").nextAction).toMatch(/Reinstate within the catch-up window/i);
  });

  it("marks the limits not currently usable rather than blanking them", () => {
    // An operator answering "what would they have had" needs the figures;
    // blanking them replaces one wrong answer with another.
    expect(limitsAreUsable("LAPSED")).toBe(false);
    expect(limitCaveat("LAPSED")).toMatch(/Not currently usable/i);
    expect(limitCaveat("LAPSED")).toMatch(/lapsed/i);
  });
});

describe("P07.06 the refusal fits the status", () => {
  it("a SUSPENDED member is told to lift the suspension", () => {
    expect(canPerformMemberAction("SUSPENDED", "CLAIM").nextAction).toMatch(/Lift the suspension/i);
  });

  it("a TERMINATED member is not told to wait — it cannot be reinstated", () => {
    const verdict = canPerformMemberAction("TERMINATED", "CLAIM");
    expect(verdict.reason).toMatch(/cannot be reinstated/i);
    expect(verdict.nextAction).not.toMatch(/reinstate/i);
  });

  it.each(["TERMINATED_FRAUD", "TERMINATED_BREACH", "TERMINATED_DEATH", "CANCELLED_COOLING_OFF", "EXPIRED"])(
    "%s is treated as terminal",
    (status) => {
      expect(canPerformMemberAction(status, "CLAIM").reason).toMatch(/cannot be reinstated/i);
    },
  );

  it("PENDING_ACTIVATION says cover has not started, not that it ended", () => {
    const verdict = canPerformMemberAction("PENDING_ACTIVATION", "CLAIM");
    expect(verdict.reason).toMatch(/cover has not started/i);
    expect(verdict.nextAction).toMatch(/Activate the membership/i);
  });

  it("a terminal principal is told where else the dependant can go", () => {
    expect(canPerformMemberAction("TERMINATED", "ADD_DEPENDANT").nextAction).toMatch(
      /different principal/i,
    );
  });

  it("names the action it is refusing", () => {
    for (const action of ACTIONS) {
      expect(canPerformMemberAction("LAPSED", action).reason).toContain(MEMBER_ACTION_LABELS[action]);
    }
  });
});

describe("P07.06 the server refuses a forged request too", () => {
  const service = readFileSync("src/server/services/members.service.ts", "utf8");
  const claimAction = readFileSync("src/app/(admin)/claims/new/actions.ts", "utf8");
  const preauthAction = readFileSync("src/app/(admin)/preauth/new/actions.ts", "utf8");
  const endorsementAction = readFileSync("src/app/(admin)/endorsements/new/actions.ts", "utf8");

  it("checks the principal's status before linking a dependant", () => {
    // "lapsed member cannot invoke protected action through UI OR FORGED
    // REQUEST" — hiding a button is not a control.
    expect(service).toContain('canPerformMemberAction(principal.status, "ADD_DEPENDANT")');
  });

  it("reads the principal's status to check it", () => {
    expect(service).toMatch(/select: \{ id: true, relationship: true, groupId: true, group: true, status: true \}/);
  });

  it("checks it AFTER the M-013/M-014 identity guards", () => {
    // "you linked to a dependant" is more useful than "that member is lapsed"
    // when both are true.
    const m013 = service.indexOf("Dependants can only be linked to a PRINCIPAL member.");
    const statusCheck = service.indexOf('canPerformMemberAction(principal.status');
    expect(m013).toBeGreaterThan(-1);
    expect(statusCheck).toBeGreaterThan(m013);
  });

  it("checks claim, pre-auth and endorsement action endpoints too", () => {
    expect(claimAction).toContain('action: "CLAIM"');
    expect(preauthAction).toContain('action: "PREAUTH"');
    expect(endorsementAction).toContain('action: "ENDORSEMENT"');
    for (const source of [claimAction, preauthAction, endorsementAction]) {
      expect(source).toContain("MemberActionGuardService.evaluate");
    }
  });
});

describe("P07.06 the profile stops advertising what it cannot honour", () => {
  const tabs = readFileSync("src/components/members/MemberProfileTabs.tsx", "utf8");
  const page = readFileSync("src/app/(admin)/members/[id]/page.tsx", "utf8");

  it("every quick action is gated by the shared policy", () => {
    expect(tabs).toContain("canPerformMemberAction(member.status, a.action)");
  });

  it("disables rather than hides, so the reason is still reachable", () => {
    // A vanished button explains nothing, and the run's complaint included the
    // absence of any reason at all.
    expect(tabs).toContain('aria-disabled="true"');
    expect(tabs).toContain("verdict.reason");
    expect(tabs).toContain("verdict.nextAction");
  });

  it("the limit bar carries the caveat and mutes the money", () => {
    expect(page).toContain("limitCaveat(member.status)");
    expect(page).toContain("limitsAreUsable(member.status)");
  });

  it("the UI and the server consult ONE policy module", () => {
    // Two answers that can drift is how a hidden button ends up hiding
    // something the server would have allowed, or vice versa.
    for (const source of [tabs, page, readFileSync("src/server/services/members.service.ts", "utf8")]) {
      expect(source).toContain("@/lib/member-action-policy");
    }
  });
});

describe("P07.06 the global entry forms do not serialize inactive or out-of-scope members", () => {
  const preauthPage = readFileSync("src/app/(admin)/preauth/new/page.tsx", "utf8");
  const endorsementPage = readFileSync("src/app/(admin)/endorsements/new/page.tsx", "utf8");

  it("pre-auth keeps client confinement and passes a minimal ACTIVE-member DTO", () => {
    expect(preauthPage).toContain("MembersService.getMembers(tenantId, session.user.clientId)");
    expect(preauthPage).toContain('member.status === "ACTIVE"');
    expect(preauthPage).toContain(".map(({ id, firstName, lastName, memberNumber })");
  });

  it("endorsements query only ACTIVE members in groups the operator can see", () => {
    expect(endorsementPage).toContain("groupId: { in: groups.map((group) => group.id) }");
    expect(endorsementPage).toContain('status: "ACTIVE"');
    expect(endorsementPage).not.toContain('status: { in: ["ACTIVE", "SUSPENDED"] }');
  });
});
