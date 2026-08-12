/**
 * WP-E1 — endorsement-engine convergence governance.
 *
 * MEMBER_ADDITION / MEMBER_DELETION are the most-tested endorsement types, yet the
 * legacy approve→apply path skipped every control the Process-7 amendment engine
 * enforced. This suite pins the convergence: the ADD/DELETE route now enforces
 *   E-004 — approver holds a role authorised for the type (from AMENDMENT_RULES),
 *   E-007 — a back-dated joiner/leaver needs an APPROVED back-date override,
 *   E-015 — a material change carries a source reference or a linked document,
 *   before/after snapshots, a day-count ProRataCalculation artifact, and the
 *   E-005 atomic two-checker race (exactly one apply).
 * Plus BENEFICIARY_UPDATE is no longer a silent no-op in applyAmendment.
 *
 * The createMember/coverage-period behaviour is unchanged (see
 * enrolment-coverage-periods.test.ts); here we assert the governance layer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async (..._args: any[]) => true) }));

const db = vi.hoisted(() => {
  const state: any = {
    endorsement: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    member: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (a: MockDbArgs) => ({ id: "newm", memberNumber: "MVX-2026-00001", ...(a.data ?? {}) })),
      update: vi.fn(async () => ({ id: "delm" })),
    },
    memberCoveragePeriod: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    group: { findUnique: vi.fn(async () => null) },
    package: { findUnique: vi.fn(async () => ({ maxAge: 65, dependentMaxAge: 24 })) },
    groupBenefitTier: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
    overrideRecord: { findUnique: vi.fn(async () => null) },
    proRataCalculation: { upsert: vi.fn(async () => ({})) },
    document: { count: vi.fn(async () => 0) },
    invoice: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    commissionLedgerEntry: { create: vi.fn(async () => ({})) },
  };
  // UAT-HF P05.03: createMember runs inside one transaction; the shim hands the
  // callback the same mock client so these assertions are unchanged.
  state.$transaction = async (fn: (tx: unknown) => unknown) => fn(state);
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/rbac.service", () => ({ rbacService: rbac }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));
vi.mock("@/server/services/fraud.service", () => ({ FraudService: { checkEnrollmentRisk: vi.fn(async () => []) } }));
vi.mock("@/server/services/member-numbering.service", () => ({ nextMemberNumber: vi.fn(async () => "MVX-2026-00001") }));
vi.mock("@/server/services/gl.service", () => ({ GLService: { postEndorsementAdjustment: vi.fn(async () => ({})) } }));

import { EndorsementsService } from "@/server/services/endorsement.service";
import { amendmentService } from "@/server/services/amendment.service";

// Clock-relative dates so back-date detection (effectiveDate < start-of-today) is
// deterministic regardless of when the suite runs.
const FUTURE = () => new Date(Date.now() + 5 * 86400000);
const PAST = () => new Date(Date.now() - 40 * 86400000);
const PERIOD_START = () => new Date(Date.now() - 100 * 86400000);
const PERIOD_END = () => new Date(Date.now() + 265 * 86400000);

// A back-date override that satisfies E-007.
const approvedOverride = { id: "ovr1", tenantId: "t1", overrideType: "BACK_DATED_AMENDMENT", status: "APPROVED" };

const submittedDeletion = (over: MockDbOverrides = {}) => ({
  id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_DELETION",
  changeDetails: { memberId: "delm", sourceReference: "HR-LTR-2026-0007" },
  effectiveDate: FUTURE(), proratedAmount: 0, groupId: "g1", overrideRecordId: null,
  endorsementNumber: "END-2026-00001", ...over,
});

const submittedAddition = (over: MockDbOverrides = {}) => ({
  id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_ADDITION",
  changeDetails: {
    firstName: "Ann", lastName: "New", dateOfBirth: "1995-05-05", gender: "FEMALE",
    relationship: "PRINCIPAL", sourceReference: "HR-LTR-2026-0008",
  },
  effectiveDate: FUTURE(), proratedAmount: 0, groupId: "g1", overrideRecordId: null,
  endorsementNumber: "END-2026-00002", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  rbac.hasRole.mockResolvedValue(true);
  db.endorsement.updateMany.mockResolvedValue({ count: 1 });
  db.endorsement.update.mockResolvedValue({});
  db.member.findUnique.mockResolvedValue(null);
  db.member.findFirst.mockResolvedValue(null);
  db.member.update.mockResolvedValue({ id: "delm" });
  db.member.create.mockImplementation(async (a: MockDbArgs) => ({ id: "newm", memberNumber: "MVX-2026-00001", ...(a.data ?? {}) }));
  db.memberCoveragePeriod.findMany.mockResolvedValue([]);
  db.memberCoveragePeriod.create.mockResolvedValue({});
  db.memberCoveragePeriod.update.mockResolvedValue({});
  db.group.findUnique.mockResolvedValue(null);
  db.package.findUnique.mockResolvedValue({ maxAge: 65, dependentMaxAge: 24 });
  db.groupBenefitTier.findFirst.mockResolvedValue(null);
  db.overrideRecord.findUnique.mockResolvedValue(null);
  db.proRataCalculation.upsert.mockResolvedValue({});
  db.document.count.mockResolvedValue(0);
});

describe("E-004 — approver-role matrix on ADD/DELETE (not just maker≠checker)", () => {
  it("blocks an approver who holds none of the type's approver roles", async () => {
    rbac.hasRole.mockResolvedValue(false); // no matrix role, not SUPER_ADMIN
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "checker"),
    ).rejects.toThrow(/Approver must hold one of/i);
    // rejected BEFORE the atomic claim → endorsement untouched
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
    expect(db.member.update).not.toHaveBeenCalled();
  });

  it("allows an approver who holds a matrix role (SoD already satisfied)", async () => {
    rbac.hasRole.mockResolvedValue(true);
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "TERMINATED" }) }),
    );
  });

  it("still blocks the maker at the approval route (SoD, before the role check)", async () => {
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion({ requestedBy: "maker" }));
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "maker"),
    ).rejects.toThrow(/Segregation of duties/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });

  it("admits a SUPER_ADMIN via the escape hatch even without a matrix role", async () => {
    // hasRole(false) for the two matrix roles, true only for SUPER_ADMIN
    rbac.hasRole.mockImplementation(async (_uid: string, role: string) => role === "SUPER_ADMIN");
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    await EndorsementsService.approveEndorsement("t1", "e1", "root");
    expect(db.member.update).toHaveBeenCalled();
  });
});

describe("E-007 — back-dated joiner/leaver requires an APPROVED back-date override", () => {
  it("blocks a back-dated leaver with no override linked", async () => {
    db.endorsement.findUnique.mockResolvedValue(
      submittedDeletion({ effectiveDate: PAST(), overrideRecordId: null }),
    );
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "checker"),
    ).rejects.toThrow(/back-dated/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });

  it("blocks a back-dated leaver when the linked override is only PENDING", async () => {
    db.endorsement.findUnique.mockResolvedValue(
      submittedDeletion({ effectiveDate: PAST(), overrideRecordId: "ovr1" }),
    );
    db.overrideRecord.findUnique.mockResolvedValue({ ...approvedOverride, status: "PENDING" });
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "checker"),
    ).rejects.toThrow(/APPROVED BACK_DATED_AMENDMENT/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });

  it("proceeds for a back-dated joiner with an APPROVED BACK_DATED_AMENDMENT override", async () => {
    db.group.findUnique.mockResolvedValue({ id: "g1", clientId: "c1", packageId: "pkg1", packageVersionId: "pv1" });
    db.endorsement.findUnique.mockResolvedValue(
      submittedAddition({ effectiveDate: PAST(), overrideRecordId: "ovr1" }),
    );
    db.overrideRecord.findUnique.mockResolvedValue(approvedOverride);
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.member.create).toHaveBeenCalled();
  });

  it("a future/same-day effective date needs no override", async () => {
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion({ effectiveDate: FUTURE() }));
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.overrideRecord.findUnique).not.toHaveBeenCalled();
    expect(db.member.update).toHaveBeenCalled();
  });
});

describe("E-015 — material change unapprovable without source evidence", () => {
  it("blocks a material leaver with no source reference and no linked document", async () => {
    db.endorsement.findUnique.mockResolvedValue(
      submittedDeletion({ changeDetails: { memberId: "delm" } }), // no sourceReference
    );
    db.document.count.mockResolvedValue(0);
    await expect(
      EndorsementsService.approveEndorsement("t1", "e1", "checker"),
    ).rejects.toThrow(/source reference or supporting document/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });

  it("a linked supporting document satisfies the evidence control", async () => {
    db.endorsement.findUnique.mockResolvedValue(
      submittedDeletion({ changeDetails: { memberId: "delm" } }),
    );
    db.document.count.mockResolvedValue(1);
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.member.update).toHaveBeenCalled();
  });

  it("a source reference on the change satisfies the control without a DB read", async () => {
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion()); // carries sourceReference
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.document.count).not.toHaveBeenCalled();
    expect(db.member.update).toHaveBeenCalled();
  });
});

describe("before/after snapshots on ADD/DELETE apply", () => {
  it("DELETE records the leaver's prior state as `before` and TERMINATED as `after`", async () => {
    db.member.findUnique.mockResolvedValue({
      id: "delm", memberNumber: "MVX-1", status: "ACTIVE",
      benefitTierId: "t1", packageId: "p1", coverStartDate: new Date("2026-01-01"), coverEndDate: null,
    });
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion({ changeDetails: { memberId: "delm", lastDay: "2026-08-06", sourceReference: "HR-LTR" } }));
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    const snapCall = db.endorsement.update.mock.calls.find((c: any[]) => c[0]?.data?.afterSnapshot);
    expect(snapCall).toBeTruthy();
    expect(snapCall![0].data.beforeSnapshot).toEqual(expect.objectContaining({ status: "ACTIVE", memberNumber: "MVX-1" }));
    expect(snapCall![0].data.afterSnapshot).toEqual(expect.objectContaining({ status: "TERMINATED" }));
  });

  it("ADD records a null `before` and the minted member as `after`", async () => {
    db.group.findUnique.mockResolvedValue({ id: "g1", clientId: "c1", packageId: "pkg1", packageVersionId: "pv1" });
    db.endorsement.findUnique.mockResolvedValue(submittedAddition());
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    const snapCall = db.endorsement.update.mock.calls.find((c: any[]) => c[0]?.data?.afterSnapshot);
    expect(snapCall).toBeTruthy();
    expect(snapCall![0].data.beforeSnapshot).toBeNull();
    expect(snapCall![0].data.afterSnapshot).toEqual(
      expect.objectContaining({ status: "ACTIVE", memberNumber: "MVX-2026-00001", relationship: "PRINCIPAL" }),
    );
  });
});

describe("day-count pro-rata (reuses the ProRataCalculation artifact)", () => {
  it("a leaver persists a negative CREDIT day-count calculation", async () => {
    db.group.findUnique.mockResolvedValue({
      effectiveDate: PERIOD_START(), renewalDate: PERIOD_END(), contributionRate: 365000,
    });
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    expect(db.proRataCalculation.upsert).toHaveBeenCalledTimes(1);
    const payload = db.proRataCalculation.upsert.mock.calls.at(-1)![0].create;
    expect(payload.adjustmentType).toBe("CREDIT");
    expect(payload.adjustmentAmount).toBeLessThan(0);
    expect(payload.daysRemaining).toBeGreaterThan(0);
    expect(payload.totalDaysInPeriod).toBeGreaterThan(0);
    expect(payload.prorataFactor).toBeGreaterThan(0);
  });

  it("a joiner persists a positive CHARGE day-count calculation", async () => {
    db.group.findUnique.mockResolvedValue({
      id: "g1", clientId: "c1", packageId: "pkg1", packageVersionId: "pv1",
      effectiveDate: PERIOD_START(), renewalDate: PERIOD_END(), contributionRate: 365000,
    });
    db.endorsement.findUnique.mockResolvedValue(submittedAddition());
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    const payload = db.proRataCalculation.upsert.mock.calls.at(-1)![0].create;
    expect(payload.adjustmentType).toBe("CHARGE");
    expect(payload.adjustmentAmount).toBeGreaterThan(0);
  });

  it("skips (writes no calculation) when the group has no positive contribution", async () => {
    db.group.findUnique.mockResolvedValue({ id: "g1", contributionRate: 0 });
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    await EndorsementsService.approveEndorsement("t1", "e1", "checker");
    expect(db.proRataCalculation.upsert).not.toHaveBeenCalled();
  });
});

describe("E-005 — two-checker race applies exactly once", () => {
  it("of two concurrent approvals, exactly one applies and the other is rejected", async () => {
    db.endorsement.findUnique.mockResolvedValue(submittedDeletion());
    // The atomic status-guarded claim is the decision gate: first claim wins (1),
    // the racing claim matches 0 rows.
    db.endorsement.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      EndorsementsService.approveEndorsement("t1", "e1", "checkerA"),
      EndorsementsService.approveEndorsement("t1", "e1", "checkerB"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/just actioned by another reviewer/i);
    // The loser never touches the member — exactly one apply.
    expect(db.member.update).toHaveBeenCalledTimes(1);
  });
});

describe("BENEFICIARY_UPDATE — no longer a silent no-op (amendmentService.applyAmendment)", () => {
  const approvedBeneficiaryUpdate = () => ({
    id: "e1", tenantId: "t1", endorsementNumber: "END-2026-00099", type: "BENEFICIARY_UPDATE",
    status: "APPROVED", makerId: "maker1", groupId: "g1", changeDetails: { nominee: "Jane" },
    proRataCalculation: null, member: null,
  });

  it("rejects the apply as unsupported and reverts APPLIED→APPROVED (no member write)", async () => {
    db.endorsement.findUnique.mockResolvedValue(approvedBeneficiaryUpdate());
    db.endorsement.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      amendmentService.applyAmendment("e1", "t1", "applier"),
    ).rejects.toThrow(/no beneficiary-designation model/i);

    // reverted to APPROVED (stays pending, not lost) and nothing was mutated
    const reverted = db.endorsement.updateMany.mock.calls.some((c: any[]) => c[0]?.data?.status === "APPROVED");
    expect(reverted).toBe(true);
    expect(db.member.update).not.toHaveBeenCalled();
  });
});
