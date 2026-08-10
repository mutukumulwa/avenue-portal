/**
 * F-PIN-2 backfill (scripts/uat/backfill-group-member-pins.ts). The dry-run must
 * REPORT every NULL-pin group (and the version each would receive) and write
 * NOTHING; APPLY writes the group pins and cascades to null-pin members.
 */
import { describe, it, expect, vi } from "vitest";
import { backfillGroupMemberPins, type PinsDb } from "../../scripts/uat/backfill-group-member-pins";

function makeDb(over: Partial<Record<"groups" | "members", unknown[]>> = {}): {
  db: PinsDb;
  groupUpdate: ReturnType<typeof vi.fn>;
  memberUpdate: ReturnType<typeof vi.fn>;
} {
  const groups = (over.groups as any[]) ?? [
    { id: "g1", name: "Bound Scheme", packageId: "pkg1", package: { currentVersionId: "pv1" } },
    { id: "g2", name: "No-Version Scheme", packageId: "pkg2", package: { currentVersionId: null } },
  ];
  const members = (over.members as any[]) ?? [
    { id: "m1", memberNumber: "MVX-1", groupId: "g1", group: { packageVersionId: null, package: { currentVersionId: "pv1" } } },
    { id: "m2", memberNumber: "MVX-2", groupId: "g2", group: { packageVersionId: null, package: { currentVersionId: null } } },
  ];
  const groupUpdate = vi.fn(async () => ({}));
  const memberUpdate = vi.fn(async () => ({}));
  const db: PinsDb = {
    group: { findMany: vi.fn(async () => groups as any), update: groupUpdate as any },
    member: { findMany: vi.fn(async () => members as any), update: memberUpdate as any },
  };
  return { db, groupUpdate, memberUpdate };
}

describe("backfillGroupMemberPins — dry run", () => {
  it("reports the NULL-pin groups (and their target version) and writes nothing", async () => {
    const { db, groupUpdate, memberUpdate } = makeDb();
    const report = await backfillGroupMemberPins(db, { apply: false });

    expect(report.nullPinGroups).toBe(2);
    expect(report.pinnableGroups).toBe(1);
    expect(report.unpinnableGroups).toBe(1);
    expect(report.groups).toEqual([
      { id: "g1", name: "Bound Scheme", packageId: "pkg1", target: "pv1" },
      { id: "g2", name: "No-Version Scheme", packageId: "pkg2", target: null },
    ]);
    // Members: m1 resolves (pv1); m2's group is unpinnable → stuck.
    expect(report.memberFixable).toBe(1);
    expect(report.memberStuck).toBe(1);

    // DRY-RUN writes nothing.
    expect(groupUpdate).not.toHaveBeenCalled();
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it("reports nothing when there are no null-pin rows", async () => {
    const { db } = makeDb({ groups: [], members: [] });
    const report = await backfillGroupMemberPins(db, { apply: false });
    expect(report.nullPinGroups).toBe(0);
    expect(report.nullPinMembers).toBe(0);
  });
});

describe("backfillGroupMemberPins — apply", () => {
  it("pins the pinnable group and cascades to its null-pin member; leaves unpinnable rows", async () => {
    const { db, groupUpdate, memberUpdate } = makeDb();
    const report = await backfillGroupMemberPins(db, { apply: true });

    expect(groupUpdate).toHaveBeenCalledTimes(1);
    expect(groupUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: { packageVersionId: "pv1" } });
    expect(memberUpdate).toHaveBeenCalledTimes(1);
    expect(memberUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { packageVersionId: "pv1" } });

    expect(report.pinnableGroups).toBe(1);
    expect(report.memberFixable).toBe(1);
  });
});
