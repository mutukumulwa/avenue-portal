import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => {
  const state: any = {
    group: { findFirst: vi.fn() },
    package: { findFirst: vi.fn() },
    groupBenefitTier: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "u1", tenantId: "t1" } }),
  ROLES: { MEMBER_OPS: ["MEMBER_OPS"] },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTierAction, updateTierAction, deleteTierAction } from "@/app/(admin)/groups/[id]/tiers/actions";

/** FormData that models the hidden("false") + checkbox("true") isDefault pair. */
function fd(entries: Record<string, string>, isDefaultChecked = false): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  f.append("isDefault", "false");
  if (isDefaultChecked) f.append("isDefault", "true");
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.group.findFirst.mockResolvedValue({ id: "g1" });
  db.package.findFirst.mockResolvedValue({ id: "pkgA" });
  db.groupBenefitTier.create.mockResolvedValue({ id: "t-new" });
  db.groupBenefitTier.updateMany.mockResolvedValue({ count: 0 });
  writeAudit.mockResolvedValue(undefined);
});

// ─── createTierAction ───────────────────────────────────────────────────────

describe("createTierAction — WP-S3", () => {
  it("flips the default transactionally and audits (S-007)", async () => {
    await createTierAction(
      fd({ groupId: "g1", name: "Executive", packageId: "pkgA", contributionRate: "75000" }, true),
    );
    // default cleared then created, both inside the same $transaction
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.groupBenefitTier.updateMany).toHaveBeenCalledWith({
      where: { groupId: "g1" },
      data: { isDefault: false },
    });
    expect(db.groupBenefitTier.create).toHaveBeenCalledOnce();
    expect(db.groupBenefitTier.create.mock.calls[0][0].data.isDefault).toBe(true);
    expect(writeAudit.mock.calls[0][0].action).toBe("GROUP_TIER_CREATED");
  });

  it("rejects a NaN contribution rate before any write", async () => {
    await expect(
      createTierAction(fd({ groupId: "g1", name: "Exec", packageId: "pkgA", contributionRate: "abc" })),
    ).rejects.toThrow();
    expect(db.groupBenefitTier.create).not.toHaveBeenCalled();
  });

  it("rejects a package that does not belong to the tenant", async () => {
    db.package.findFirst.mockResolvedValue(null);
    await expect(
      createTierAction(fd({ groupId: "g1", name: "Exec", packageId: "foreign", contributionRate: "1000" })),
    ).rejects.toThrow(/package does not exist/i);
    expect(db.groupBenefitTier.create).not.toHaveBeenCalled();
  });
});

// ─── updateTierAction ───────────────────────────────────────────────────────

describe("updateTierAction — WP-S3", () => {
  it("blocks an in-use tier's package change (routes to member transfer, S-008)", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", packageId: "pkgA", isDefault: false, name: "Exec", contributionRate: 1000,
      group: { tenantId: "t1" }, _count: { members: 4 },
    });
    db.package.findFirst.mockResolvedValue({ id: "pkgB" });
    await expect(
      updateTierAction(fd({ tierId: "t1", groupId: "g1", name: "Exec", packageId: "pkgB", contributionRate: "1000" })),
    ).rejects.toThrow(/Tier Change endorsement/i);
    expect(db.groupBenefitTier.update).not.toHaveBeenCalled();
  });

  it("refuses to unset the last remaining default", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", packageId: "pkgA", isDefault: true, name: "Exec", contributionRate: 1000,
      group: { tenantId: "t1" }, _count: { members: 0 },
    });
    db.groupBenefitTier.findFirst.mockResolvedValue(null); // no other default
    await expect(
      updateTierAction(fd({ tierId: "t1", groupId: "g1", name: "Exec", packageId: "pkgA", contributionRate: "1000" }, false)),
    ).rejects.toThrow(/default/i);
    expect(db.groupBenefitTier.update).not.toHaveBeenCalled();
  });

  it("updates a non-default in-place tier and audits", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", packageId: "pkgA", isDefault: false, name: "Old", contributionRate: 1000,
      group: { tenantId: "t1" }, _count: { members: 2 },
    });
    await updateTierAction(fd({ tierId: "t1", groupId: "g1", name: "New", packageId: "pkgA", contributionRate: "2000" }));
    expect(db.groupBenefitTier.update).toHaveBeenCalledOnce();
    expect(writeAudit.mock.calls[0][0].action).toBe("GROUP_TIER_UPDATED");
  });
});

// ─── deleteTierAction ───────────────────────────────────────────────────────

describe("deleteTierAction — WP-S3", () => {
  it("protects the default tier from deletion", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", name: "Default", packageId: "pkgA", isDefault: true,
      group: { tenantId: "t1" }, _count: { members: 0 },
    });
    await expect(deleteTierAction(fd({ tierId: "t1", groupId: "g1" }))).rejects.toThrow(/default tier/i);
    expect(db.groupBenefitTier.delete).not.toHaveBeenCalled();
  });

  it("blocks deleting a tier that still has members", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", name: "Staff", packageId: "pkgA", isDefault: false,
      group: { tenantId: "t1" }, _count: { members: 3 },
    });
    await expect(deleteTierAction(fd({ tierId: "t1", groupId: "g1" }))).rejects.toThrow(/member/i);
    expect(db.groupBenefitTier.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty non-default tier and audits", async () => {
    db.groupBenefitTier.findUnique.mockResolvedValue({
      id: "t1", name: "Staff", packageId: "pkgA", isDefault: false,
      group: { tenantId: "t1" }, _count: { members: 0 },
    });
    db.groupBenefitTier.delete.mockResolvedValue({ id: "t1" });
    await deleteTierAction(fd({ tierId: "t1", groupId: "g1" }));
    expect(db.groupBenefitTier.delete).toHaveBeenCalledOnce();
    expect(writeAudit.mock.calls[0][0].action).toBe("GROUP_TIER_DELETED");
  });
});
