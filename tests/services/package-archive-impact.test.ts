/**
 * UAT-HF P09.06 — DEF-025 (S2).
 *
 * "Selecting 'Archived' produces no dialog, no alert, no inline warning and no
 * statement of consequence, and the save produces no success message.
 * Critically, repeating the selection on a package that an ACTIVE scheme is
 * bound to produced **no dependency warning of any kind** — nothing indicates
 * the package is in use or which scheme would be affected."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  ARCHIVE_ACKNOWLEDGEMENT_FIELD,
  describeArchiveImpact,
  getPackageArchiveImpact,
} from "@/server/services/package-archive-impact.service";

const groupFindMany = vi.fn();
const tierFindMany = vi.fn();
const memberCount = vi.fn();
const db = {
  group: { findMany: groupFindMany },
  groupBenefitTier: { findMany: tierFindMany },
  member: { count: memberCount },
} as never;

beforeEach(() => {
  groupFindMany.mockReset().mockResolvedValue([]);
  tierFindMany.mockReset().mockResolvedValue([]);
  memberCount.mockReset().mockResolvedValue(0);
});

describe("P09.06 what archiving would affect", () => {
  it("finds schemes bound to the package directly", async () => {
    groupFindMany.mockResolvedValue([{ id: "g1", name: "NWSC Staff" }]);
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.schemes).toEqual([{ id: "g1", name: "NWSC Staff", via: "SCHEME" }]);
    expect(impact.inUse).toBe(true);
  });

  it("finds schemes bound through a named benefit tier", async () => {
    tierFindMany.mockResolvedValue([{ name: "Executive", group: { id: "g2", name: "Pearl" } }]);
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.schemes[0]).toEqual({
      id: "g2",
      name: "Pearl",
      via: "TIER",
      tierName: "Executive",
    });
  });

  it("counts enrolled members, not only schemes", async () => {
    // A scheme with no members is a configuration problem; one with two
    // thousand is an incident. The operator should be able to tell them apart.
    memberCount.mockResolvedValue(2317);
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.memberCount).toBe(2317);
    expect(impact.inUse).toBe(true);
  });

  it("is scoped to the tenant on every probe", async () => {
    await getPackageArchiveImpact(db, "t1", "p1");
    expect(groupFindMany.mock.calls[0][0].where.tenantId).toBe("t1");
    expect(tierFindMany.mock.calls[0][0].where.group.tenantId).toBe("t1");
    expect(memberCount.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("reports an unused package as not in use", async () => {
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.inUse).toBe(false);
    expect(impact.schemes).toEqual([]);
  });

  it("counts a scheme reached twice the same way only once", async () => {
    groupFindMany.mockResolvedValue([
      { id: "g1", name: "NWSC Staff" },
      { id: "g1", name: "NWSC Staff" },
    ]);
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.schemes).toHaveLength(1);
  });

  it("keeps a scheme reached BOTH directly and via a tier as two distinct routes", async () => {
    // They are different bindings and both would be left pointing at an
    // archived package; collapsing them would understate the impact.
    groupFindMany.mockResolvedValue([{ id: "g1", name: "NWSC Staff" }]);
    tierFindMany.mockResolvedValue([{ name: "Exec", group: { id: "g1", name: "NWSC Staff" } }]);
    const impact = await getPackageArchiveImpact(db, "t1", "p1");
    expect(impact.schemes).toHaveLength(2);
  });
});

describe("P09.06 the consequence is stated in words", () => {
  it("names the scheme when there is exactly one", () => {
    const summary = describeArchiveImpact(
      { schemes: [{ id: "g1", name: "NWSC Staff", via: "SCHEME" }], memberCount: 12, inUse: true },
      "Gold Plan",
    );
    // "nothing indicates the package is in use or WHICH SCHEME would be affected"
    expect(summary).toContain("NWSC Staff");
    expect(summary).toContain("Gold Plan");
    expect(summary).toContain("12 enrolled members");
  });

  it("says plainly what archiving does NOT do", () => {
    const summary = describeArchiveImpact(
      { schemes: [{ id: "g1", name: "A", via: "SCHEME" }], memberCount: 1, inUse: true },
      "Gold Plan",
    );
    // An operator who thinks archiving ends cover will hesitate; one who thinks
    // it migrates members will be wrong in the other direction.
    expect(summary).toMatch(/does NOT move or end their cover/i);
  });

  it("uses singular wording for one member", () => {
    const summary = describeArchiveImpact(
      { schemes: [{ id: "g1", name: "A", via: "SCHEME" }], memberCount: 1, inUse: true },
      "P",
    );
    expect(summary).toContain("1 enrolled member");
    expect(summary).not.toContain("1 enrolled members");
  });

  it("says so when nothing is affected, rather than staying silent", () => {
    const summary = describeArchiveImpact({ schemes: [], memberCount: 0, inUse: false }, "Old Plan");
    expect(summary).toMatch(/not used by any scheme/i);
  });
});

describe("P09.06 the server refuses an unacknowledged archive", () => {
  const actions = readFileSync("src/app/(admin)/packages/[id]/edit/actions.ts", "utf8");

  it("checks the impact before archiving", () => {
    expect(actions).toContain("getPackageArchiveImpact");
  });

  it("requires an explicit acknowledgement when the package is in use", () => {
    // By the shared constant, not a literal: the server and the form's hidden
    // field cannot drift apart if only one place spells the name.
    expect(actions).toContain("ARCHIVE_ACKNOWLEDGEMENT_FIELD");
    expect(actions).toMatch(/impact\.inUse && !acknowledged/);
    // And the form posts exactly that name.
    const form = readFileSync("src/app/(admin)/packages/[id]/edit/PackageEditForm.tsx", "utf8");
    expect(form).toContain(`name="${ARCHIVE_ACKNOWLEDGEMENT_FIELD}"`);
  });

  it("only bites on the transition INTO archived", () => {
    // Re-saving an already-archived package is not a destructive act and must
    // not be obstructed.
    expect(actions).toMatch(/core\.status === "ARCHIVED" && pkg\.status !== "ARCHIVED"/);
  });

  it("audits the archive with what it affected", () => {
    expect(actions).toContain('action: "PACKAGE_ARCHIVED"');
    expect(actions).toContain("schemesAffected");
    expect(actions).toContain("membersAffected");
  });

  it("returns the consequence as the status field's error, beside the control", () => {
    expect(actions).toMatch(/status: \[describeArchiveImpact\(impact, pkg\.name\)\]/);
  });
});

describe("P09.06 the form explains before it is submitted", () => {
  const form = readFileSync("src/app/(admin)/packages/[id]/edit/PackageEditForm.tsx", "utf8");

  it("warns as soon as Archived is selected, not after the save", () => {
    expect(form).toContain("archivingNow");
    expect(form).toMatch(/role="alert"/);
  });

  it("lists the affected schemes by name", () => {
    expect(form).toContain("impact.schemes.map");
  });

  it("names the tier when the binding goes through one", () => {
    expect(form).toContain("s.tierName");
  });

  it("requires the acknowledgement checkbox only when in use", () => {
    expect(form).toMatch(/impact\.inUse && \(/);
    expect(form).toContain('name="__confirmArchiveInUse"');
  });

  it("does not nag when the package is already archived", () => {
    expect(form).toMatch(/status === "ARCHIVED" && pkg\.status !== "ARCHIVED"/);
  });
});
