import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeLegalName } from "@/lib/normalize";

// ── Mocks ─────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => {
  const state: any = {
    package: { findUnique: vi.fn() },
    group: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    member: { findMany: vi.fn(), updateMany: vi.fn() },
    groupBenefitTier: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(state)),
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const coverage = vi.hoisted(() => ({
  closeOpenPeriods: vi.fn(async () => {}),
  openPeriod: vi.fn(async () => {}),
}));
vi.mock("@/server/services/coverage.service", () => ({ coverageService: coverage }));

const resolveSchemeClientId = vi.hoisted(() => vi.fn(async () => "client-1"));
vi.mock("@/server/services/clientResolve", () => ({ resolveSchemeClientId }));

import {
  GroupsService,
  GROUP_STATUS_TRANSITIONS,
  DuplicateSchemeNameError,
  InvalidGroupTransitionError,
} from "@/server/services/groups.service";

const TENANT = "t1";

function loadedGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    name: "Lakeview Staff Medical Scheme",
    clientId: "client-1",
    status: "ACTIVE",
    suspendedAt: null,
    suspensionReason: null,
    terminatedAt: null,
    industry: "Finance",
    registrationNumber: "CPR/2026/1",
    address: null,
    county: null,
    contactPersonName: "Jane",
    contactPersonPhone: "+256700000000",
    contactPersonEmail: "jane@x.co",
    paymentFrequency: "ANNUAL",
    effectiveDate: new Date("2026-08-01"),
    renewalDate: new Date("2027-08-01"),
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveSchemeClientId.mockResolvedValue("client-1");
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.group.create.mockResolvedValue({ id: "g-new" });
  db.member.findMany.mockResolvedValue([]);
  db.member.updateMany.mockResolvedValue({ count: 0 });
});

// ─── createGroup (WP-S1) ────────────────────────────────────────────────────

describe("GroupsService.createGroup — WP-S1 identity + validation", () => {
  beforeEach(() => {
    db.package.findUnique.mockResolvedValue({
      id: "pkg1",
      currentVersionId: "pv1",
      currentVersion: { id: "pv1" },
      contributionAmount: 1000,
    });
  });

  it("rejects a client-scoped duplicate name (case/space insensitive) — S-002", async () => {
    db.group.findFirst.mockResolvedValue({ id: "existing" });
    await expect(
      GroupsService.createGroup(TENANT, {
        name: "  Lakeview   Staff Medical Scheme ",
        contactPersonName: "Jane",
        contactPersonPhone: "+256700000000",
        contactPersonEmail: "jane@x.co",
        packageId: "pkg1",
        effectiveDate: "2026-08-01",
      }),
    ).rejects.toBeInstanceOf(DuplicateSchemeNameError);
    // The dup check is CLIENT-scoped (not tenant-scoped) and case-insensitive.
    const where = db.group.findFirst.mock.calls[0][0].where;
    expect(where.clientId).toBe("client-1");
    expect(where.tenantId).toBeUndefined();
    expect(where.name.mode).toBe("insensitive");
    expect(db.group.create).not.toHaveBeenCalled();
  });

  it("writes nameNormalized + trimmed name and pins the package version (F-PIN-2)", async () => {
    db.group.findFirst.mockResolvedValue(null);
    await GroupsService.createGroup(TENANT, {
      name: "  Lakeview   Staff Medical Scheme ",
      contactPersonName: "Jane",
      contactPersonPhone: "+256700000000",
      contactPersonEmail: "jane@x.co",
      packageId: "pkg1",
      effectiveDate: "2026-08-01",
    });
    const data = db.group.create.mock.calls[0][0].data;
    expect(data.name).toBe("Lakeview Staff Medical Scheme");
    expect(data.nameNormalized).toBe(normalizeLegalName("Lakeview Staff Medical Scheme"));
    expect(data.packageVersionId).toBe("pv1");
    // renewal derived = effective + 1 year
    expect(new Date(data.renewalDate).getUTCFullYear()).toBe(2027);
  });

  it("rejects an invalid effective date before touching the DB", async () => {
    db.group.findFirst.mockResolvedValue(null);
    await expect(
      GroupsService.createGroup(TENANT, {
        name: "X Scheme",
        contactPersonName: "Jane",
        contactPersonPhone: "+256700000000",
        contactPersonEmail: "jane@x.co",
        packageId: "pkg1",
        effectiveDate: "not-a-date",
      }),
    ).rejects.toThrow(/invalid/i);
    expect(db.group.create).not.toHaveBeenCalled();
  });
});

// ─── updateGroup (WP-S1) ────────────────────────────────────────────────────

describe("GroupsService.updateGroup — WP-S1 rename + date order + audit diff", () => {
  it("enforces effectiveDate < renewalDate", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup());
    await expect(
      GroupsService.updateGroup(TENANT, "g1", {
        name: "Lakeview Staff Medical Scheme",
        contactPersonName: "Jane",
        contactPersonPhone: "+256700000000",
        contactPersonEmail: "jane@x.co",
        paymentFrequency: "ANNUAL",
        effectiveDate: "2027-08-01",
        renewalDate: "2026-08-01", // before start
      }),
    ).rejects.toThrow(/renewal date must be after/i);
    expect(db.group.update).not.toHaveBeenCalled();
  });

  it("re-checks the client-scoped duplicate rule on rename", async () => {
    db.group.findFirst.mockImplementation(({ where }: any) => {
      if (where.id && typeof where.id === "object" && "not" in where.id) {
        return Promise.resolve({ id: "other" }); // a clash exists
      }
      return Promise.resolve(loadedGroup());
    });
    await expect(
      GroupsService.updateGroup(TENANT, "g1", {
        name: "A Totally Different Name",
        contactPersonName: "Jane",
        contactPersonPhone: "+256700000000",
        contactPersonEmail: "jane@x.co",
        paymentFrequency: "ANNUAL",
        effectiveDate: "2026-08-01",
        renewalDate: "2027-08-01",
      }),
    ).rejects.toBeInstanceOf(DuplicateSchemeNameError);
    expect(db.group.update).not.toHaveBeenCalled();
  });

  it("returns before/after snapshots for the audit and never writes status", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup());
    db.group.update.mockResolvedValue(loadedGroup({ contactPersonName: "John" }));
    const res = await GroupsService.updateGroup(TENANT, "g1", {
      name: "Lakeview Staff Medical Scheme",
      contactPersonName: "John",
      contactPersonPhone: "+256700000000",
      contactPersonEmail: "jane@x.co",
      paymentFrequency: "ANNUAL",
      effectiveDate: "2026-08-01",
      renewalDate: "2027-08-01",
    });
    expect(res.before.contactPersonName).toBe("Jane");
    expect(res.after.contactPersonName).toBe("John");
    // status is NOT part of the profile update payload (governed separately).
    expect(db.group.update.mock.calls[0][0].data).not.toHaveProperty("status");
  });
});

// ─── state machine (WP-S2) ──────────────────────────────────────────────────

describe("GroupsService transition table — WP-S2 / D9", () => {
  it("terminal states have no forward transitions", () => {
    expect(GROUP_STATUS_TRANSITIONS.LAPSED).toEqual([]);
    expect(GROUP_STATUS_TRANSITIONS.TERMINATED).toEqual([]);
  });

  it("canTransition blocks terminal→ACTIVE without override, allows with override", () => {
    expect(GroupsService.canTransition("TERMINATED", "ACTIVE", false)).toBe(false);
    expect(GroupsService.canTransition("LAPSED", "ACTIVE", false)).toBe(false);
    expect(GroupsService.canTransition("TERMINATED", "ACTIVE", true)).toBe(true);
    // override cannot invent arbitrary edges (only terminal→ACTIVE).
    expect(GroupsService.canTransition("TERMINATED", "SUSPENDED", true)).toBe(false);
    expect(GroupsService.canTransition("ACTIVE", "SUSPENDED", false)).toBe(true);
  });

  it("assertTransition throws for an invalid move (S-006)", () => {
    expect(() => GroupsService.assertTransition("ACTIVE", "PROSPECT")).toThrow(
      InvalidGroupTransitionError,
    );
    expect(() => GroupsService.assertTransition("TERMINATED", "ACTIVE")).toThrow(
      /terminal/i,
    );
  });
});

describe("GroupsService.changeGroupStatus — WP-S2 cascade (S-005/S-006)", () => {
  it("manual SUSPEND cascades members and closes their coverage periods", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup({ status: "ACTIVE" }));
    db.member.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const effective = new Date("2026-09-01");

    const res = await GroupsService.changeGroupStatus(TENANT, "g1", {
      targetStatus: "SUSPENDED",
      reason: "Invoice overdue > 60 days",
      effectiveDate: effective,
    });

    // group row
    const gUpd = db.group.update.mock.calls[0][0].data;
    expect(gUpd.status).toBe("SUSPENDED");
    expect(gUpd.suspendedAt).toEqual(effective);
    expect(gUpd.suspensionReason).toBe("Invoice overdue > 60 days");
    // members swept ACTIVE→SUSPENDED
    expect(db.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SUSPENDED" } }),
    );
    // each member's open coverage period CLOSED at the effective date (WP-3.5E reuse)
    expect(coverage.closeOpenPeriods).toHaveBeenCalledTimes(2);
    expect(coverage.closeOpenPeriods).toHaveBeenCalledWith(db, "m1", effective, "GROUP_SUSPENDED");
    expect(res.affectedMembers).toBe(2);
    expect(res.before.status).toBe("ACTIVE");
    expect(res.after.status).toBe("SUSPENDED");
  });

  it("SUSPEND without a reason is rejected and writes nothing", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup({ status: "ACTIVE" }));
    await expect(
      GroupsService.changeGroupStatus(TENANT, "g1", { targetStatus: "SUSPENDED" }),
    ).rejects.toThrow(/reason is required/i);
    expect(db.group.update).not.toHaveBeenCalled();
  });

  it("reactivate restores suspended members and re-opens coverage", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup({ status: "SUSPENDED", suspendedAt: new Date("2026-09-01") }));
    db.member.findMany.mockResolvedValue([{ id: "m1" }]);
    const effective = new Date("2026-10-01");
    const res = await GroupsService.changeGroupStatus(TENANT, "g1", {
      targetStatus: "ACTIVE",
      effectiveDate: effective,
    });
    const gUpd = db.group.update.mock.calls[0][0].data;
    expect(gUpd.status).toBe("ACTIVE");
    expect(gUpd.suspendedAt).toBeNull();
    expect(gUpd.suspensionReason).toBeNull();
    expect(db.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ACTIVE" } }),
    );
    expect(coverage.openPeriod).toHaveBeenCalledWith(db, TENANT, "m1", effective, "GROUP_REACTIVATED");
    expect(res.after.status).toBe("ACTIVE");
  });

  it("blocks a terminal→ACTIVE reversal without override (S-006) — no writes", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup({ status: "TERMINATED", terminatedAt: new Date() }));
    await expect(
      GroupsService.changeGroupStatus(TENANT, "g1", { targetStatus: "ACTIVE" }),
    ).rejects.toBeInstanceOf(InvalidGroupTransitionError);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.group.update).not.toHaveBeenCalled();
  });

  it("governed override reinstates a terminal scheme (reason required)", async () => {
    db.group.findFirst.mockResolvedValue(loadedGroup({ status: "TERMINATED", terminatedAt: new Date() }));
    // reason missing → rejected
    await expect(
      GroupsService.changeGroupStatus(TENANT, "g1", { targetStatus: "ACTIVE", override: true }),
    ).rejects.toThrow(/reason is required/i);
    // with reason → clears terminal marks
    const res = await GroupsService.changeGroupStatus(TENANT, "g1", {
      targetStatus: "ACTIVE",
      override: true,
      reason: "Appeal upheld",
    });
    const gUpd = db.group.update.mock.calls[0][0].data;
    expect(gUpd.status).toBe("ACTIVE");
    expect(gUpd.terminatedAt).toBeNull();
    expect(res.after.terminatedAt).toBeNull();
  });
});

// ─── tiers (WP-S3) ──────────────────────────────────────────────────────────

describe("GroupsService.resolveDefaultTierId — WP-S3 auto-assign mechanism", () => {
  it("returns the default tier id when one exists, else null", async () => {
    db.groupBenefitTier.findFirst.mockResolvedValueOnce({ id: "t-default" });
    expect(await GroupsService.resolveDefaultTierId("g1")).toBe("t-default");
    db.groupBenefitTier.findFirst.mockResolvedValueOnce(null);
    expect(await GroupsService.resolveDefaultTierId("g1")).toBeNull();
    // queried by groupId + isDefault
    expect(db.groupBenefitTier.findFirst.mock.calls[0][0].where).toEqual({
      groupId: "g1",
      isDefault: true,
    });
  });
});
