/**
 * WP-3.5E — MemberCoveragePeriod is opened/closed on every enrolment & lifecycle
 * write path so SP-6's point-in-time engine (coverageService) sees every member:
 *  - manual enrolment (MembersService.createMember — also the members-import path)
 *    opens a period at the effective date + honours the effective date + age gate;
 *  - a manual suspend closes the open period, reinstate reopens it;
 *  - endorsement MEMBER_ADDITION opens a period; MEMBER_DELETION closes it on the
 *    approved inclusive last day (EO-010/011: covered the 6th, not the 7th).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));

const db = vi.hoisted(() => {
  const state: any = {
    group: { findUnique: vi.fn() },
    package: { findUnique: vi.fn(async () => ({ maxAge: 65, dependentMaxAge: 24 })) },
    member: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(),
      create: vi.fn(async (a: MockDbArgs) => ({ id: "m1", ...(a.data ?? {}) })),
      update: vi.fn(async (a: MockDbArgs) => ({ id: a.where!.id, ...(a.data ?? {}) })),
    },
    // WP-3.5F: createMember now auto-assigns the scheme's default benefit tier.
    groupBenefitTier: { findFirst: vi.fn(async () => null) },
    memberCoveragePeriod: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    endorsement: {
      findUnique: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    // WP-E1: E-007 back-date override lookup + day-count ProRataCalculation artifact.
    overrideRecord: { findUnique: vi.fn(async () => null) },
    proRataCalculation: { upsert: vi.fn(async () => ({})) },
    document: { count: vi.fn(async () => 0) },
  };
  return state;
});

// WP-E1: an APPROVED back-date override — the coverage fixtures use past effective
// dates (a leaver who left last week / a joiner backdated to period start), which
// E-007 governs. The evidence + override make the governed apply proceed.
const APPROVED_BACKDATE_OVERRIDE = { id: "ovr1", tenantId: "t1", overrideType: "BACK_DATED_AMENDMENT", status: "APPROVED" };

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// WP-E1: E-004 approver-role matrix resolves via rbacService.hasRole.
vi.mock("@/server/services/rbac.service", () => ({ rbacService: rbac }));
vi.mock("@/server/services/fraud.service", () => ({
  FraudService: { checkEnrollmentRisk: vi.fn(async () => []) },
}));
// WP-3.5F/G: endorsement approve/apply + leaver now audit via the chain service.
vi.mock("@/server/services/audit-chain.service", () => ({
  auditChainService: { append: vi.fn(async () => ({})) },
}));
vi.mock("@/server/services/member-numbering.service", () => ({
  nextMemberNumber: vi.fn(async () => "MVX-2026-00001"),
}));
vi.mock("@/server/services/gl.service", () => ({
  GLService: { postEndorsementAdjustment: vi.fn(async () => ({})) },
}));

import { MembersService } from "@/server/services/members.service";
import { EndorsementsService } from "@/server/services/endorsement.service";
import { coverageService } from "@/server/services/coverage.service";

// Baseline impls re-established every test so nothing leaks across blocks.
beforeEach(() => {
  vi.clearAllMocks();
  rbac.hasRole.mockResolvedValue(true);
  db.package.findUnique.mockResolvedValue({ maxAge: 65, dependentMaxAge: 24 });
  db.member.findFirst.mockResolvedValue(null);
  db.member.create.mockImplementation(async (a: MockDbArgs) => ({ id: "m1", ...(a.data ?? {}) }));
  db.member.update.mockImplementation(async (a: MockDbArgs) => ({ id: a.where!.id, ...(a.data ?? {}) }));
  db.memberCoveragePeriod.findFirst.mockResolvedValue(null);
  db.memberCoveragePeriod.findMany.mockResolvedValue([]);
  db.memberCoveragePeriod.create.mockResolvedValue({});
  db.memberCoveragePeriod.update.mockResolvedValue({});
  db.endorsement.updateMany.mockResolvedValue({ count: 1 });
  db.endorsement.update.mockResolvedValue({});
  db.overrideRecord.findUnique.mockResolvedValue(APPROVED_BACKDATE_OVERRIDE);
  db.proRataCalculation.upsert.mockResolvedValue({});
  db.document.count.mockResolvedValue(0);
});

describe("MembersService.createMember — coverage period + effective date + pin + age", () => {
  beforeEach(() => {
    db.group.findUnique.mockResolvedValue({ id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" });
  });

  it("opens a coverage period at the effective date and pins the member", async () => {
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "John", lastName: "Doe",
      dateOfBirth: "1990-01-01", gender: "MALE", relationship: "PRINCIPAL",
      effectiveDate: "2026-08-01",
    });

    expect(db.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enrollmentDate: new Date("2026-08-01"),
          coverStartDate: new Date("2026-08-01"),
          packageVersionId: "pv1",
        }),
      }),
    );
    expect(db.memberCoveragePeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: "m1", startDate: new Date("2026-08-01"), reason: "ENROLMENT" }),
      }),
    );
  });

  it("defaults the coverage period to today when no effective date is given (import path)", async () => {
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Jane", lastName: "Roe",
      dateOfBirth: "1992-02-02", gender: "FEMALE", relationship: "PRINCIPAL",
    });
    expect(db.memberCoveragePeriod.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an over-age principal — no member, no coverage period", async () => {
    await expect(
      MembersService.createMember("t1", {
        groupId: "g1", firstName: "Old", lastName: "Man",
        dateOfBirth: "1950-01-01", gender: "MALE", relationship: "PRINCIPAL",
        effectiveDate: "2026-08-01",
      }),
    ).rejects.toThrow(/maximum age/i);
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.memberCoveragePeriod.create).not.toHaveBeenCalled();
  });
});

describe("MembersService.updateMember — suspend closes / reinstate reopens coverage", () => {
  const baseData = {
    firstName: "A", lastName: "B", dateOfBirth: "1990-01-01",
    gender: "MALE" as const, relationship: "PRINCIPAL" as const,
  };

  it("ACTIVE → SUSPENDED closes the open coverage period", async () => {
    db.member.findUnique.mockResolvedValue({ id: "m1", status: "ACTIVE", idNumber: null, phone: null });
    db.memberCoveragePeriod.findMany.mockResolvedValue([{ id: "cp1", startDate: new Date("2026-01-01") }]);

    await MembersService.updateMember("t1", "m1", { ...baseData, status: "SUSPENDED" });

    expect(db.memberCoveragePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cp1" }, data: expect.objectContaining({ reason: "SUSPENDED" }) }),
    );
    expect(db.memberCoveragePeriod.create).not.toHaveBeenCalled();
  });

  it("SUSPENDED → ACTIVE reopens a coverage period", async () => {
    db.member.findUnique.mockResolvedValue({ id: "m1", status: "SUSPENDED", idNumber: null, phone: null });

    await MembersService.updateMember("t1", "m1", { ...baseData, status: "ACTIVE" });

    expect(db.memberCoveragePeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "REINSTATEMENT" }) }),
    );
  });

  it("a plain edit with no status change touches no coverage period", async () => {
    db.member.findUnique.mockResolvedValue({ id: "m1", status: "ACTIVE", idNumber: null, phone: null });

    await MembersService.updateMember("t1", "m1", { ...baseData, status: "ACTIVE" });

    expect(db.memberCoveragePeriod.update).not.toHaveBeenCalled();
    expect(db.memberCoveragePeriod.create).not.toHaveBeenCalled();
  });
});

describe("EndorsementsService.approveEndorsement — MEMBER_ADDITION coverage period", () => {
  beforeEach(() => {
    db.group.findUnique.mockResolvedValue({ id: "g1", clientId: "c1", packageId: "pkg1", packageVersionId: "pv1" });
    db.member.create.mockResolvedValue({ id: "newm" });
  });

  it("opens a coverage period at the endorsement effective date for the added member", async () => {
    db.endorsement.findUnique.mockResolvedValue({
      id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_ADDITION",
      changeDetails: { firstName: "Ann", lastName: "New", dateOfBirth: "1995-05-05", gender: "FEMALE", relationship: "PRINCIPAL", sourceReference: "HR-LTR-2026-0001" },
      // WP-E1: past effective date → E-007 needs an APPROVED back-date override (mocked in beforeEach).
      effectiveDate: new Date("2026-08-01"), proratedAmount: 0, groupId: "g1", overrideRecordId: "ovr1", endorsementNumber: "END-1",
    });

    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    expect(db.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enrollmentDate: new Date("2026-08-01"),
          coverStartDate: new Date("2026-08-01"),
          packageVersionId: "pv1",
        }),
      }),
    );
    expect(db.memberCoveragePeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: "newm", startDate: new Date("2026-08-01"), reason: "ENDORSEMENT" }),
      }),
    );
  });

  it("rejects an over-age added member — reverts the endorsement, mints no member", async () => {
    db.endorsement.findUnique.mockResolvedValue({
      id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_ADDITION",
      changeDetails: { firstName: "Old", lastName: "Guy", dateOfBirth: "1950-01-01", gender: "MALE", relationship: "PRINCIPAL", sourceReference: "HR-LTR-2026-0002" },
      effectiveDate: new Date("2026-08-01"), proratedAmount: 0, groupId: "g1", overrideRecordId: "ovr1", endorsementNumber: "END-1",
    });

    await expect(EndorsementsService.approveEndorsement("t1", "e1", "checker")).rejects.toThrow(/maximum age/i);
    expect(db.member.create).not.toHaveBeenCalled();
    const reverted = db.endorsement.updateMany.mock.calls.some((c: any[]) => c[0]?.data?.status === "SUBMITTED");
    expect(reverted).toBe(true);
  });
});

describe("EndorsementsService.approveEndorsement — MEMBER_DELETION inclusive last day (EO-010/011)", () => {
  it("honours the approved lastDay: sets coverEndDate + closes the period ON that day", async () => {
    db.member.update.mockResolvedValue({ id: "delm" });
    db.memberCoveragePeriod.findMany.mockResolvedValue([{ id: "cp1", startDate: new Date("2026-01-01") }]);
    db.endorsement.findUnique.mockResolvedValue({
      id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_DELETION",
      changeDetails: { memberId: "delm", lastDay: "2026-08-06", sourceReference: "HR-LTR-2026-0003" },
      effectiveDate: new Date("2026-08-10"), proratedAmount: 0, groupId: "g1", overrideRecordId: "ovr1", endorsementNumber: "END-2",
    });

    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    // coverEndDate is the APPROVED last day, NOT today / the endorsement effectiveDate.
    expect(db.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "delm" },
        data: expect.objectContaining({ status: "TERMINATED", coverEndDate: new Date("2026-08-06") }),
      }),
    );
    // …and the coverage period closes ON the 6th (inclusive).
    expect(db.memberCoveragePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cp1" }, data: expect.objectContaining({ endDate: new Date("2026-08-06") }) }),
    );
  });

  it("falls back to the endorsement effective date when no lastDay is supplied", async () => {
    db.member.update.mockResolvedValue({ id: "delm" });
    db.memberCoveragePeriod.findMany.mockResolvedValue([{ id: "cp1", startDate: new Date("2026-01-01") }]);
    db.endorsement.findUnique.mockResolvedValue({
      id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_DELETION",
      changeDetails: { memberId: "delm", sourceReference: "HR-LTR-2026-0004" },
      effectiveDate: new Date("2026-08-10"), proratedAmount: 0, groupId: "g1", overrideRecordId: "ovr1", endorsementNumber: "END-3",
    });

    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    expect(db.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverEndDate: new Date("2026-08-10") }) }),
    );
  });
});

describe("coverageService.evaluate — leaver covered on the last day, not the day after", () => {
  it("a period closed on 2026-08-06 covers the 6th but not the 7th (EO-010/011 live shape)", async () => {
    const tx: any = {
      memberCoveragePeriod: {
        findMany: vi.fn(async () => [{ startDate: new Date("2026-01-01"), endDate: new Date("2026-08-06") }]),
      },
    };
    expect((await coverageService.evaluate(tx, "delm", new Date("2026-08-06"))).covered).toBe(true);
    expect((await coverageService.evaluate(tx, "delm", new Date("2026-08-07"))).covered).toBe(false);
  });
});
