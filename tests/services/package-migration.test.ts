import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P09.06 — the migration half of DEF-025.
 *
 * The impact report shipped first: archiving now names the schemes and the
 * member count. Its recorded gap was the rest of the task title — "and
 * **migration control**" — "offering to move the affected schemes to a
 * successor package, and that is not built; the operator is told what will be
 * stranded and must move them by hand."
 *
 * Moving them by hand is the failure mode. Repointing three schemes out of four
 * leaves one pointing at an archived package, which P09.06's acceptance calls a
 * "dangling current reference" and which nothing in the product surfaces again.
 */

const mocks = vi.hoisted(() => ({
  packageFindFirst: vi.fn(),
  groupCount: vi.fn(),
  tierCount: vi.fn(),
  memberCount: vi.fn(),
  groupUpdateMany: vi.fn(),
  tierUpdateMany: vi.fn(),
  memberUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    package: { findFirst: mocks.packageFindFirst },
    group: { count: mocks.groupCount, updateMany: mocks.groupUpdateMany },
    groupBenefitTier: { count: mocks.tierCount, updateMany: mocks.tierUpdateMany },
    member: { count: mocks.memberCount, updateMany: mocks.memberUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import {
  planPackageMigration,
  executePackageMigration,
  describeMigration,
} from "@/server/services/package-migration.service";

const ACTIVE_SUCCESSOR = { id: "p2", name: "Medvex Standard", status: "ACTIVE", currentVersionId: "v9" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.packageFindFirst.mockResolvedValue(ACTIVE_SUCCESSOR);
  mocks.groupCount.mockResolvedValue(3);
  mocks.tierCount.mockResolvedValue(1);
  mocks.memberCount.mockResolvedValue(0);
  mocks.groupUpdateMany.mockResolvedValue({ count: 3 });
  mocks.tierUpdateMany.mockResolvedValue({ count: 1 });
  mocks.memberUpdateMany.mockResolvedValue({ count: 250 });
  // Run the callback against the same mocked client.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      group: { updateMany: mocks.groupUpdateMany },
      groupBenefitTier: { updateMany: mocks.tierUpdateMany },
      member: { updateMany: mocks.memberUpdateMany },
    }),
  );
});

const plan = (over: Record<string, unknown> = {}) =>
  planPackageMigration({ tenantId: "t1", packageId: "p1", successorId: "p2", moveMembers: false, ...over });

describe("planning a migration", () => {
  it("describes what would move", async () => {
    const result = await plan();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({ schemeCount: 3, tierCount: 1, successorName: "Medvex Standard" });
  });

  it("refuses a successor that is the package being archived", async () => {
    const result = await plan({ successorId: "p1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("SUCCESSOR_SAME");
  });

  it("refuses an archived or draft successor", async () => {
    // Migrating onto a dead package moves the problem rather than solving it —
    // the schemes would still point at something nobody can enrol on.
    mocks.packageFindFirst.mockResolvedValue({ ...ACTIVE_SUCCESSOR, status: "ARCHIVED" });
    const result = await plan();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("SUCCESSOR_NOT_USABLE");
    expect(result.message).toMatch(/archived/i);
  });

  it("refuses a successor in another tenant", async () => {
    mocks.packageFindFirst.mockResolvedValue(null);
    const result = await plan();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("SUCCESSOR_MISSING");
    // The tenant key is in the query, not applied afterwards.
    expect(mocks.packageFindFirst.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("refuses to move members without their own authorisation", async () => {
    // Schemes are configuration; members are people with cover. Repointing a
    // member changes the benefits they can claim against.
    mocks.memberCount.mockResolvedValue(250);
    const result = await plan({ moveMembers: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MEMBERS_NOT_AUTHORISED");
    expect(result.message).toContain("250");
  });

  it("allows the member move once it is authorised", async () => {
    mocks.memberCount.mockResolvedValue(250);
    const result = await plan({ moveMembers: true });
    expect(result.ok).toBe(true);
  });
});

describe("executing a migration", () => {
  const READY = {
    schemeCount: 3,
    tierCount: 1,
    memberCount: 250,
    successorId: "p2",
    successorName: "Medvex Standard",
    successorVersionId: "v9",
  };

  it("moves schemes and tiers in one transaction", async () => {
    const outcome = await executePackageMigration({
      tenantId: "t1",
      packageId: "p1",
      plan: READY,
      moveMembers: false,
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ schemesMoved: 3, tiersMoved: 1, membersMoved: 0 });
    // A partial migration is the exact state this control exists to prevent.
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
  });

  it("moves the version pin with the member, not just the package id", async () => {
    await executePackageMigration({ tenantId: "t1", packageId: "p1", plan: READY, moveMembers: true });

    const data = mocks.memberUpdateMany.mock.calls[0][0].data;
    expect(data.packageId).toBe("p2");
    // Leaving packageVersionId on the archived package's version IS the
    // dangling reference — and every benefit lookup reads the pin first, so it
    // would silently keep serving the archived package's limits.
    expect(data.packageVersionId).toBe("v9");
  });

  it("is defined over whatever currently points at the package", async () => {
    // updateMany, not a list read earlier: a scheme created between the
    // impact snapshot and the save must move too, or it is stranded.
    await executePackageMigration({ tenantId: "t1", packageId: "p1", plan: READY, moveMembers: false });
    expect(mocks.groupUpdateMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", packageId: "p1" });
  });

  it("scopes the tier move through the group's tenant", async () => {
    await executePackageMigration({ tenantId: "t1", packageId: "p1", plan: READY, moveMembers: false });
    expect(mocks.tierUpdateMany.mock.calls[0][0].where).toEqual({
      packageId: "p1",
      group: { tenantId: "t1" },
    });
  });
});

describe("what the operator is told", () => {
  const P = {
    schemeCount: 3,
    tierCount: 1,
    memberCount: 250,
    successorId: "p2",
    successorName: "Medvex Standard",
    successorVersionId: "v9",
  };

  it("names the counts and the destination", () => {
    const text = describeMigration(P, false);
    expect(text).toContain("3 schemes");
    expect(text).toContain("1 benefit tier");
    expect(text).toContain("Medvex Standard");
  });

  it("omits members when they are not being moved", () => {
    expect(describeMigration(P, false)).not.toContain("250");
  });

  it("states the cover consequence when members ARE being moved", () => {
    const text = describeMigration(P, true);
    expect(text).toContain("250 enrolled members");
    expect(text).toMatch(/cover changes/i);
  });

  it("says plainly when nothing points at the package", () => {
    expect(
      describeMigration({ ...P, schemeCount: 0, tierCount: 0, memberCount: 0 }, true),
    ).toMatch(/moves nothing/i);
  });
});
