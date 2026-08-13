import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemberActionGuardService,
  memberActionRefusal,
} from "@/server/services/member-action-guard.service";

const findFirst = vi.fn();
const db = { member: { findFirst } } as never;

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ status: "ACTIVE" });
});

describe("P07.06 member action guard", () => {
  it("allows an ACTIVE member", async () => {
    const verdict = await MemberActionGuardService.evaluate(
      { tenantId: "t1", memberId: "m1", action: "CLAIM" },
      db,
    );
    expect(verdict.allowed).toBe(true);
  });

  it("uses the shared policy for a LAPSED member", async () => {
    findFirst.mockResolvedValue({ status: "LAPSED" });
    const verdict = await MemberActionGuardService.evaluate(
      { tenantId: "t1", memberId: "m1", action: "PREAUTH" },
      db,
    );
    expect(verdict.allowed).toBe(false);
    expect(memberActionRefusal(verdict)).toMatch(/cover is not in force/i);
    expect(memberActionRefusal(verdict)).toMatch(/reinstate/i);
  });

  it("scopes the lookup to tenant and, when supplied, group", async () => {
    await MemberActionGuardService.evaluate(
      { tenantId: "t1", memberId: "m1", groupId: "g1", action: "ENDORSEMENT" },
      db,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "m1", tenantId: "t1", groupId: "g1" },
      select: { status: true },
    });
  });

  it("does not reveal whether a missing, cross-tenant or cross-group member exists", async () => {
    findFirst.mockResolvedValue(null);
    const verdict = await MemberActionGuardService.evaluate(
      { tenantId: "t1", memberId: "outside", groupId: "g1", action: "ENDORSEMENT" },
      db,
    );
    expect(verdict.allowed).toBe(false);
    expect(memberActionRefusal(verdict)).toBe(
      "New Endorsement is not available for this member. Return to member search and select a member in your organisation.",
    );
    expect(memberActionRefusal(verdict)).not.toMatch(/outside|tenant|group/i);
  });

  it("refuses a blank identifier without querying the database", async () => {
    const verdict = await MemberActionGuardService.evaluate(
      { tenantId: "t1", memberId: "   ", action: "CLAIM" },
      db,
    );
    expect(verdict.allowed).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
