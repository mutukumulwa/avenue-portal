import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P07.02 — the LIVE lifecycle path gets the policy, the event and DEC-12.
 *
 * The earlier P07.02 commits wired all three into `changeMemberStatusAction`,
 * which has **no callers**. The member detail page calls
 * `suspendMemberAction` / `unsuspendMemberAction` in `lifecycle-actions.ts`,
 * and those went straight to `MembersService.changeStatus` with no options —
 * so the path operators actually use enforced no role rules, no staleness, no
 * back-dating, and wrote no domain event inside the transaction.
 *
 * That is the third instance in this branch of the same shape: infrastructure
 * built for a guarantee, and the caller that matters quietly opting out. These
 * tests exist so the live path cannot drift back out of it.
 */

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  findFirst: vi.fn(),
  changeStatus: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireRole: mocks.requireRole,
  ROLES: { MEMBER_OPS: ["MEMBER_OPS"] },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/services/members.service", () => ({
  MembersService: { changeStatus: mocks.changeStatus },
}));
vi.mock("@/server/services/lifecycle.service", () => ({ lifecycleService: {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  suspendMemberAction,
  unsuspendMemberAction,
} from "@/app/(admin)/members/[id]/lifecycle-actions";

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("memberId", "m1");
  fd.set("reason", "Contributions in arrears since June");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({
    user: { id: "u_ops", tenantId: "t1", role: "MEMBER_OPS" },
  });
  mocks.findFirst.mockResolvedValue({ status: "ACTIVE", version: 5 });
  mocks.changeStatus.mockResolvedValue({ previousStatus: "ACTIVE" });
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("suspend — the path the member page actually calls", () => {
  it("passes the row version as an optimistic precondition", async () => {
    await suspendMemberAction(form());
    expect(mocks.changeStatus.mock.calls[0][3]).toMatchObject({ expectedVersion: 5 });
  });

  it("writes the domain event inside the transaction", async () => {
    await suspendMemberAction(form());
    const opts = mocks.changeStatus.mock.calls[0][3];
    expect(opts.event).toMatchObject({
      actor: { id: "u_ops", role: "MEMBER_OPS" },
      reasonNote: "Contributions in arrears since June",
    });
    expect(opts.event.correlationId).toEqual(expect.any(String));
  });

  it("honours a back-dated effective date (DEC-12)", async () => {
    // The action collected `effectiveDate` and then never passed it, so the
    // coverage period closed at the click instead of the day the operator
    // entered — wrong by however many days it was back-dated.
    await suspendMemberAction(form({ effectiveDate: "2026-07-01" }));
    const used = mocks.changeStatus.mock.calls[0][3].effectiveAt as Date;
    expect(used.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("refuses a role the lifecycle policy does not name", async () => {
    mocks.requireRole.mockResolvedValue({ user: { id: "u1", tenantId: "t1", role: "BROKER" } });
    await expect(suspendMemberAction(form())).rejects.toThrow(/permission/i);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("refuses when the member has already moved", async () => {
    // The policy's staleness check runs before anything else; a member who is
    // already terminated must not be suspended on the strength of a stale page.
    mocks.findFirst.mockResolvedValue({ status: "TERMINATED", version: 5 });
    await expect(suspendMemberAction(form())).rejects.toThrow();
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("still refuses a token reason", async () => {
    await expect(suspendMemberAction(form({ reason: "x" }))).rejects.toThrow(/reason is required/i);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });
});

describe("unsuspend", () => {
  beforeEach(() => {
    mocks.findFirst.mockResolvedValue({ status: "SUSPENDED", version: 9 });
    mocks.changeStatus.mockResolvedValue({ previousStatus: "SUSPENDED" });
  });

  it("carries the version and the event too", async () => {
    await unsuspendMemberAction(form());
    const opts = mocks.changeStatus.mock.calls[0][3];
    expect(opts.expectedVersion).toBe(9);
    expect(opts.event.actor.id).toBe("u_ops");
  });

  it("refuses to reinstate a member who is not suspended", async () => {
    mocks.findFirst.mockResolvedValue({ status: "LAPSED", version: 9 });
    // LAPSED → ACTIVE is a GOVERNED_FLOW reinstatement with its own catch-up
    // window and waiting-period preservation; it must not be reachable by
    // lifting a suspension the member does not have.
    await expect(unsuspendMemberAction(form())).rejects.toThrow();
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });
});
