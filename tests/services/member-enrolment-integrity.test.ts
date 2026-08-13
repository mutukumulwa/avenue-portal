/**
 * WP-3.5F / WP-3.5G — member enrolment + lifecycle integrity.
 *
 *  - normalized duplicate detection (national ID case/space, phone +256/256/0,
 *    email case) + the new email dedup (M-005/006/007);
 *  - normalized identity is what gets STORED;
 *  - dependant guards: cannot own dependants (M-013), cannot cross schemes (M-014);
 *  - default benefit tier auto-assigned at enrolment;
 *  - newborn (CT-033): no national ID + DOB-effective when notified within 30 days;
 *  - SIBLING enrols;
 *  - the HR/endorsement channel routes MEMBER_ADDITION through createMember so it
 *    carries idNumber/phone/email AND links the principal (was a raw create);
 *  - the lifecycle state machine blocks terminal→active from the edit path.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const overrides = vi.hoisted(() => ({
  idDup: null as any,
  memberById: null as any,
  phoneDup: null as any,
  emailDup: null as any,
  nameDobDup: null as any,
  principalById: null as any,
  principalByIdNumber: null as any,
}));

const db = vi.hoisted(() => {
  const state: any = {
    group: { findUnique: vi.fn() },
    package: { findUnique: vi.fn(async () => ({ maxAge: 65, dependentMaxAge: 24 })) },
    groupBenefitTier: { findFirst: vi.fn(async () => null) },
    member: {
      // Route findFirst by its where-shape so a single mock serves every probe.
      findFirst: vi.fn(async (args: MockDbArgs) => {
        const w = args?.where ?? {};
        if (w.relationship === "PRINCIPAL" && w.idNumber !== undefined) return overrides.principalByIdNumber;
        if (w.id !== undefined) return overrides.principalById ?? overrides.memberById;
        if (w.idNumber !== undefined) return overrides.idDup;
        if (w.phone !== undefined) return overrides.phoneDup;
        if (w.email !== undefined) return overrides.emailDup;
        if (w.firstName !== undefined) return overrides.nameDobDup;
        return null;
      }),
      findUnique: vi.fn(),
      create: vi.fn(async (a: MockDbArgs) => ({ id: "newm", memberNumber: "MVX-2026-00001", ...(a.data ?? {}) })),
      update: vi.fn(async (a: MockDbArgs) => ({ id: a.where!.id, ...(a.data ?? {}) })),
      // P05.05: updateProfile is a conditional updateMany.
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
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
    // WP-E1: E-007 back-date override + day-count ProRataCalculation + E-015 doc check.
    overrideRecord: { findUnique: vi.fn(async () => ({ id: "ovr1", tenantId: "t1", overrideType: "BACK_DATED_AMENDMENT", status: "APPROVED" })) },
    proRataCalculation: { upsert: vi.fn(async () => ({})) },
    document: { count: vi.fn(async () => 0) },
  };
  // UAT-HF P05.03: createMember now runs inside one transaction. The shim hands
  // the callback the same mock client, so the assertions below are unchanged.
  state.$transaction = async (fn: (tx: unknown) => unknown) => fn(state);
  return state;
});

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// WP-E1: E-004 approver-role matrix resolves via rbacService.hasRole.
vi.mock("@/server/services/rbac.service", () => ({ rbacService: rbac }));
vi.mock("@/server/services/fraud.service", () => ({
  FraudService: { checkEnrollmentRisk: vi.fn(async () => []) },
}));
vi.mock("@/server/services/member-numbering.service", () => ({
  nextMemberNumber: vi.fn(async () => "MVX-2026-00001"),
}));
vi.mock("@/server/services/audit-chain.service", () => ({
  auditChainService: { append: vi.fn(async () => ({})) },
}));
vi.mock("@/server/services/gl.service", () => ({
  GLService: { postEndorsementAdjustment: vi.fn(async () => ({})) },
}));

import { MembersService } from "@/server/services/members.service";
import { EndorsementsService } from "@/server/services/endorsement.service";

const lastCreate = () => db.member.create.mock.calls.at(-1)![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  rbac.hasRole.mockResolvedValue(true);
  db.overrideRecord.findUnique.mockResolvedValue({ id: "ovr1", tenantId: "t1", overrideType: "BACK_DATED_AMENDMENT", status: "APPROVED" });
  db.proRataCalculation.upsert.mockResolvedValue({});
  db.document.count.mockResolvedValue(0);
  overrides.idDup = null;
  overrides.memberById = null;
  overrides.phoneDup = null;
  overrides.emailDup = null;
  overrides.nameDobDup = null;
  overrides.principalById = null;
  overrides.principalByIdNumber = null;
  db.package.findUnique.mockResolvedValue({ maxAge: 65, dependentMaxAge: 24 });
  db.groupBenefitTier.findFirst.mockResolvedValue(null);
  db.member.create.mockImplementation(async (a: MockDbArgs) => ({ id: "newm", memberNumber: "MVX-2026-00001", ...(a.data ?? {}) }));
  db.memberCoveragePeriod.findFirst.mockResolvedValue(null);
  db.group.findUnique.mockResolvedValue({ id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" });
});

const base = {
  groupId: "g1", firstName: "John", lastName: "Doe",
  dateOfBirth: "1990-01-01", gender: "MALE" as const, relationship: "PRINCIPAL" as const,
};

describe("createMember — normalized duplicate detection (M-005/006/007)", () => {
  it("stores the NORMALIZED identity keys (id upper/no-space, phone E.164, email lowercase)", async () => {
    await MembersService.createMember("t1", {
      ...base, idNumber: "ck 12 34", phone: "0700123456", email: "A@B.com",
    });
    const d = lastCreate();
    expect(d.idNumber).toBe("CK1234");
    expect(d.phone).toBe("+256700123456");
    expect(d.email).toBe("a@b.com");
  });

  it("probes the national ID case-insensitively against the normalized key", async () => {
    await MembersService.createMember("t1", { ...base, idNumber: "ck 12 34" });
    const idProbe = db.member.findFirst.mock.calls.find((c: any) => c[0]?.where?.idNumber !== undefined);
    expect(idProbe![0].where.idNumber).toEqual({ equals: "CK1234", mode: "insensitive" });
  });

  it("probes the phone across every UG format so 0700… collides with a stored +256700…", async () => {
    await MembersService.createMember("t1", { ...base, phone: "0700123456" });
    const phoneProbe = db.member.findFirst.mock.calls.find((c: any) => c[0]?.where?.phone !== undefined);
    expect(phoneProbe![0].where.phone.in).toContain("+256700123456");
    expect(phoneProbe![0].where.phone.in).toContain("0700123456");
  });

  /**
   * UAT-HF P05.04 rewrote the three assertions below, and the reason matters
   * more than the diff.
   *
   * They asserted that a duplicate PHONE and a duplicate EMAIL are rejected.
   * DEC-07 is signed and explicit that they must not be: "Shared household
   * numbers are legitimate and common — a principal and their dependants
   * routinely share one number ... a duplicate phone is at most a *candidate
   * warning*, never a hard conflict." So the old expectations encoded a defect,
   * and were changed to the governed behaviour rather than to make them pass.
   *
   * They also asserted the message wording — 'phone "…" already exists: Ann Old
   * (MVX-1)' — which is DEF-078's disclosure itself, an S2 privacy finding.
   */
  it("does NOT reject a shared phone — households share a line (DEC-07)", async () => {
    overrides.phoneDup = { id: "m-other", memberNumber: "MVX-1", firstName: "Ann", lastName: "Old" };
    const result = await MembersService.createMember("t1", { ...base, phone: "+256700123456" });
    expect(db.member.create).toHaveBeenCalled();
    // Not silent, though: it surfaces as a candidate warning beside the success.
    expect(result.warnings.join(" ")).toMatch(/phone number is already recorded/i);
  });

  it("does NOT reject a shared email, for the same reason", async () => {
    overrides.emailDup = { id: "m-other", memberNumber: "MVX-3", firstName: "Cy", lastName: "Old" };
    const result = await MembersService.createMember("t1", { ...base, email: "USER@Example.com" });
    expect(db.member.create).toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/email address is already recorded/i);
    const emailProbe = db.member.findFirst.mock.calls.find((c: any) => c[0]?.where?.email !== undefined);
    expect(emailProbe![0].where.email).toEqual({ equals: "user@example.com", mode: "insensitive" });
  });

  it("still rejects a case/space national-ID duplicate — the one hard conflict", async () => {
    overrides.idDup = { id: "m-other", memberNumber: "MVX-2", firstName: "Bob", lastName: "Old" };
    await expect(
      MembersService.createMember("t1", { ...base, idNumber: "CK1234" }),
    ).rejects.toThrow(/national ID is already recorded against another member/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it("names nobody when it rejects — DEF-078", async () => {
    overrides.idDup = { id: "m-other", memberNumber: "MVX-2", firstName: "Bob", lastName: "Old" };
    const error = await MembersService.createMember("t1", { ...base, idNumber: "CK1234" }).catch(
      (e: Error) => e,
    );
    // The run could supply an identifier and learn who held it, one guess at a
    // time. Not any more, in either direction.
    expect(String(error)).not.toMatch(/Bob|Old|MVX-2/);
  });

  it("refuses an unparseable phone instead of storing the raw garbage — DEF-029", async () => {
    await expect(
      MembersService.createMember("t1", { ...base, phone: "12345" }),
    ).rejects.toThrow(/Ugandan phone number/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it("refuses forged demographics before opening the enrolment transaction", async () => {
    await expect(
      MembersService.createMember("t1", {
        ...base,
        gender: "UNKNOWN" as never,
        email: "not-an-email",
      }),
    ).rejects.toThrow(/valid gender|valid email/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });
});

describe("createMember — structured address (P05.06)", () => {
  it("stores every Uganda hierarchy level and a server-owned coordinate consent timestamp", async () => {
    await MembersService.createMember("t1", {
      ...base,
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira Municipality",
      addressSubcounty: "Namugongo Division",
      addressParish: "Kyaliwajjala",
      addressVillage: "Buwate",
      addressLine: "Plot 18",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsent: true,
    });
    expect(lastCreate()).toMatchObject({
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira Municipality",
      addressSubcounty: "Namugongo Division",
      addressParish: "Kyaliwajjala",
      addressVillage: "Buwate",
      addressLine: "Plot 18",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsentAt: expect.any(Date),
    });
  });

  it("refuses coordinates without consent at the service boundary", async () => {
    await expect(
      MembersService.createMember("t1", {
        ...base,
        addressDistrict: "Wakiso",
        addressLatitude: "0.347596",
        addressLongitude: "32.582520",
      }),
    ).rejects.toThrow(/consent/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });
});

describe("createMember — dependant guards (M-013 / M-014) + default tier", () => {
  it("M-013: rejects linking a dependant to a member that is not a PRINCIPAL", async () => {
    overrides.principalById = { id: "p1", relationship: "CHILD", status: "ACTIVE", groupId: "g1", group: { id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" } };
    await expect(
      MembersService.createMember("t1", { ...base, relationship: "CHILD", principalId: "p1" }),
    ).rejects.toThrow(/can only be linked to a PRINCIPAL/i);
  });

  it("M-014: rejects a dependant enrolled into a scheme other than its principal's", async () => {
    overrides.principalById = { id: "p1", relationship: "PRINCIPAL", status: "ACTIVE", groupId: "gPrincipal", group: { id: "gPrincipal", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" } };
    await expect(
      MembersService.createMember("t1", { ...base, groupId: "gOther", relationship: "CHILD", principalId: "p1" }),
    ).rejects.toThrow(/same scheme as its principal/i);
  });

  it("auto-assigns the scheme's default benefit tier", async () => {
    db.groupBenefitTier.findFirst.mockResolvedValue({ id: "tierDefault" });
    await MembersService.createMember("t1", base);
    expect(lastCreate().benefitTierId).toBe("tierDefault");
  });
});

describe("createMember — newborn (CT-033) + SIBLING", () => {
  /**
   * UAT-HF (DEF-031) — these two newborn fixtures enrolled a CHILD with NO
   * principalId, which is exactly the orphan the run recorded: "Submitting
   * creates a live ACTIVE dependant with no principal, no family unit and its
   * own full Annual Limit of UGX 25,000,000 ... Three such orphaned CHILD
   * members were created during this run."
   *
   * Nothing in CT-033 says a newborn has no parent — it says a newborn may
   * enrol without a NATIONAL ID. The fixtures now link a principal, which is
   * what a newborn actually has. The behaviour under test (cover from DOB, no
   * ID required) is unchanged.
   */
  it("accepts a newborn with NO national ID and covers from the DOB when notified within 30 days", async () => {
    overrides.principalById = { id: "p1", relationship: "PRINCIPAL", status: "ACTIVE", groupId: "g1", group: { id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" } };
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Baby", lastName: "Doe", principalId: "p1",
      dateOfBirth: "2026-08-01", gender: "FEMALE", relationship: "CHILD",
      effectiveDate: "2026-08-20", birthNotificationDate: "2026-08-10", // 9 days after birth
    });
    const d = lastCreate();
    // covered from birth, not the supplied effective date
    expect(d.coverStartDate).toEqual(new Date("2026-08-01"));
    expect(d.enrollmentDate).toEqual(new Date("2026-08-01"));
    expect(d.birthNotificationDate).toEqual(new Date("2026-08-10"));
    expect(d.idNumber).toBeNull(); // no ID required
    expect(db.memberCoveragePeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ startDate: new Date("2026-08-01") }) }),
    );
  });

  it("a LATE birth notification (>30 days) keeps the supplied effective date", async () => {
    overrides.principalById = { id: "p1", relationship: "PRINCIPAL", status: "ACTIVE", groupId: "g1", group: { id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" } };
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Late", lastName: "Notice", principalId: "p1",
      dateOfBirth: "2026-01-01", gender: "MALE", relationship: "CHILD",
      effectiveDate: "2026-08-10", birthNotificationDate: "2026-08-10",
    });
    expect(lastCreate().coverStartDate).toEqual(new Date("2026-08-10"));
  });

  it("REFUSES a dependant with no principal — DEF-031's orphan", async () => {
    // "Three such orphaned CHILD members were created during this run
    // (UX26-2026-00010, -00011, -00012), including the two controlled twins."
    await expect(
      MembersService.createMember("t1", {
        groupId: "g1", firstName: "Orphan", lastName: "Child",
        dateOfBirth: "2018-01-01", gender: "FEMALE", relationship: "CHILD",
      }),
    ).rejects.toThrow(/must be linked to a principal member/i);
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it("points at the route that does it correctly", async () => {
    const error = await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Orphan", lastName: "Child",
      dateOfBirth: "2018-01-01", gender: "FEMALE", relationship: "SPOUSE",
    }).catch((e: Error) => e);
    // A refusal with no way forward is only half an answer.
    expect(String(error)).toMatch(/Add Dependent/);
  });

  it("still allows a PRINCIPAL with no principalId, which is the normal case", async () => {
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Solo", lastName: "Principal",
      dateOfBirth: "1990-01-01", gender: "MALE", relationship: "PRINCIPAL",
    });
    expect(db.member.create).toHaveBeenCalled();
  });

  it("enrols a SIBLING dependant (new relationship)", async () => {
    overrides.principalById = { id: "p1", relationship: "PRINCIPAL", status: "ACTIVE", groupId: "g1", group: { id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" } };
    await MembersService.createMember("t1", {
      groupId: "g1", firstName: "Sib", lastName: "Ling",
      dateOfBirth: "2000-01-01", gender: "MALE", relationship: "SIBLING", principalId: "p1",
    });
    expect(lastCreate().relationship).toBe("SIBLING");
  });
});

/**
 * UAT-HF P05.05 split `updateMember` into `updateProfile` (demographics, with a
 * precondition) and `changeStatus` (a lifecycle command with a reason). The
 * state machine is unchanged and still guards the same transitions; only the
 * entry point moved, so these assertions follow it.
 */
describe("changeStatus — lifecycle state machine (WP-3.5G)", () => {
  it("BLOCKS a terminal → active reinstatement from the edit path", async () => {
    overrides.memberById = { id: "m1", status: "TERMINATED" };
    await expect(MembersService.changeStatus("t1", "m1", "ACTIVE")).rejects.toThrow(
      /governed lifecycle state/i,
    );
    expect(db.member.update).not.toHaveBeenCalled();
  });

  it("returns the previous status so the caller can pick a distinct audit action", async () => {
    overrides.memberById = { id: "m1", status: "ACTIVE" };
    const res = await MembersService.changeStatus("t1", "m1", "SUSPENDED");
    expect(res.previousStatus).toBe("ACTIVE");
  });
});

describe("updateProfile — P05.05 concurrency and scope", () => {
  it("writes conditionally on the loaded updatedAt, and reports STALE when it moved", async () => {
    db.member.updateMany.mockResolvedValue({ count: 0 });
    const outcome = await MembersService.updateProfile(
      "t1",
      "m1",
      { firstName: "Changed" },
      { updatedAt: new Date("2026-08-12T09:00:00Z") },
    );
    // Nothing was written — DEF-077's silent lost update, now visible.
    expect(outcome).toBe("STALE");
    const where = db.member.updateMany.mock.calls.at(-1)![0].where;
    expect(where).toEqual({
      id: "m1",
      tenantId: "t1",
      updatedAt: new Date("2026-08-12T09:00:00Z"),
    });
  });

  it("APPLIED when the precondition held", async () => {
    db.member.updateMany.mockResolvedValue({ count: 1 });
    const outcome = await MembersService.updateProfile(
      "t1",
      "m1",
      { firstName: "Changed" },
      { updatedAt: new Date() },
    );
    expect(outcome).toBe("APPLIED");
  });

  it("writes ONLY the fields it was given, never the whole record", async () => {
    db.member.updateMany.mockResolvedValue({ count: 1 });
    // Via the override, not mockResolvedValue: replacing the router's
    // implementation leaks into every later test in the file.
    overrides.memberById = { firstName: "Old", lastName: "Name", otherNames: null };
    await MembersService.updateProfile("t1", "m1", { firstName: "Changed" }, { updatedAt: new Date() });

    // The other half of DEF-077: a stale whole-record write reverted a field
    // "neither operator intended to touch".
    const data = db.member.updateMany.mock.calls.at(-1)![0].data;
    expect(data.firstName).toBe("Changed");
    // Nothing the operator did not touch. The two extras are not "other
    // fields": searchNameNormalized is DERIVED from the name they just changed
    // (P05.01 — leaving it stale would un-key the member for search), and
    // version is the concurrency counter (P04.05).
    expect(Object.keys(data).sort()).toEqual(["firstName", "searchNameNormalized", "version"]);
    expect(data.version).toEqual({ increment: 1 });
    expect(data.lastName).toBeUndefined();
    expect(data.phone).toBeUndefined();
  });

  it("has no way to change status — the parameter does not exist", async () => {
    db.member.updateMany.mockResolvedValue({ count: 1 });
    await MembersService.updateProfile(
      "t1",
      "m1",
      { firstName: "A", status: "TERMINATED" } as never,
      { updatedAt: new Date() },
    );
    // Even passed deliberately, it cannot reach the update.
    expect(db.member.updateMany.mock.calls.at(-1)![0].data).not.toHaveProperty("status");
  });

  it("normalises identity fields on the way in", async () => {
    db.member.updateMany.mockResolvedValue({ count: 1 });
    await MembersService.updateProfile(
      "t1",
      "m1",
      { idNumber: "ck 12 34", phone: "0700123456", email: "A@B.com" },
      { updatedAt: new Date() },
    );
    const data = db.member.updateMany.mock.calls.at(-1)![0].data;
    expect(data.idNumber).toBe("CK1234");
    expect(data.phone).toBe("+256700123456");
    expect(data.email).toBe("a@b.com");
  });

  it("rejects invalid partial demographics at the service boundary", async () => {
    await expect(
      MembersService.updateProfile(
        "t1",
        "m1",
        { relationship: "COUSIN", email: "not-an-email" },
        { updatedAt: new Date() },
      ),
    ).rejects.toThrow(/valid relationship|valid email/i);
    expect(db.member.updateMany).not.toHaveBeenCalled();
  });

  it("cannot turn an unlinked principal into an orphan dependant through profile editing", async () => {
    overrides.memberById = { principalId: null, _count: { dependents: 0 } };
    await expect(
      MembersService.updateProfile(
        "t1",
        "m1",
        { relationship: "CHILD" },
        { updatedAt: new Date() },
      ),
    ).rejects.toThrow(/cannot be changed into a dependant/i);
    expect(db.member.updateMany).not.toHaveBeenCalled();
  });

  it("cannot turn a linked dependant into a principal while retaining its family link", async () => {
    overrides.memberById = { principalId: "p1", _count: { dependents: 0 } };
    await expect(
      MembersService.updateProfile(
        "t1",
        "m1",
        { relationship: "PRINCIPAL" },
        { updatedAt: new Date() },
      ),
    ).rejects.toThrow(/cannot be changed into a principal/i);
    expect(db.member.updateMany).not.toHaveBeenCalled();
  });

  it("still refuses a national ID that belongs to somebody else, naming nobody", async () => {
    overrides.idDup = { id: "m-other", memberNumber: "MVX-9", firstName: "Zed", lastName: "Other" };
    db.member.updateMany.mockResolvedValue({ count: 1 });
    const error = await MembersService.updateProfile(
      "t1",
      "m1",
      { idNumber: "CK1234" },
      { updatedAt: new Date() },
    ).catch((e: Error) => e);
    expect(String(error)).toMatch(/already recorded against another member/i);
    expect(String(error)).not.toMatch(/Zed|Other|MVX-9/);
    expect(db.member.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing at all when there is nothing to change", async () => {
    const outcome = await MembersService.updateProfile("t1", "m1", {}, { updatedAt: new Date() });
    expect(outcome).toBe("APPLIED");
    expect(db.member.updateMany).not.toHaveBeenCalled();
  });

  it("updates a complete validated address block and clears coordinates on consent withdrawal", async () => {
    overrides.memberById = {
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira",
      addressSubcounty: null,
      addressParish: null,
      addressVillage: null,
      addressLine: null,
      addressLatitude: { toString: () => "0.347596" },
      addressLongitude: { toString: () => "32.582520" },
      addressCoordinateConsentAt: new Date("2026-08-01T00:00:00Z"),
    };
    await MembersService.updateProfile(
      "t1",
      "m1",
      {
        addressCountry: "Uganda",
        addressDistrict: "Kampala",
        addressLocality: "Central Division",
        addressSubcounty: "",
        addressParish: "",
        addressVillage: "",
        addressLine: "",
        addressLatitude: "",
        addressLongitude: "",
        addressCoordinateConsent: "",
      },
      { updatedAt: new Date() },
    );
    expect(db.member.updateMany.mock.calls.at(-1)![0].data).toMatchObject({
      addressCountry: "Uganda",
      addressDistrict: "Kampala",
      addressLocality: "Central Division",
      addressLatitude: null,
      addressLongitude: null,
      addressCoordinateConsentAt: null,
    });
  });
});

describe("endorsement MEMBER_ADDITION → createMember (WP-3.5F HR-channel parity)", () => {
  it("carries idNumber/phone/email AND links the principal resolved from principalIdNumber", async () => {
    // The endorsement resolves the principal by National ID → member id, then
    // createMember re-validates that id — both lookups must resolve.
    overrides.principalByIdNumber = { id: "principalMember" };
    overrides.principalById = {
      status: "ACTIVE",
      id: "principalMember", relationship: "PRINCIPAL", groupId: "g1",
      group: { id: "g1", packageId: "pkg1", packageVersionId: "pv1", clientId: "c1" },
    };
    db.endorsement.findUnique.mockResolvedValue({
      id: "e1", tenantId: "t1", status: "SUBMITTED", requestedBy: "maker", type: "MEMBER_ADDITION",
      changeDetails: {
        firstName: "Dep", lastName: "Endant", dateOfBirth: "2010-05-05", gender: "FEMALE",
        relationship: "CHILD", idNumber: "cd 99 88", phone: "0700999888", email: "Dep@Family.com",
        principalIdNumber: "PRIN123", sourceReference: "HR-LTR-2026-0005",
        addressCountry: "Uganda", addressDistrict: "Wakiso", addressLocality: "Kira",
        addressSubcounty: "Namugongo", addressParish: "Kyaliwajjala", addressVillage: "Buwate",
        addressLatitude: "0.347596", addressLongitude: "32.582520", addressCoordinateConsent: true,
      },
      // WP-E1: past effective date → E-007 override linked (APPROVED in beforeEach).
      effectiveDate: new Date("2026-08-01"), proratedAmount: 0, groupId: "g1", overrideRecordId: "ovr1", endorsementNumber: "END-1",
    });

    await EndorsementsService.approveEndorsement("t1", "e1", "checker");

    const d = lastCreate();
    // Contact fields the OLD raw create dropped are now present + normalized.
    expect(d.idNumber).toBe("CD9988");
    expect(d.phone).toBe("+256700999888");
    expect(d.email).toBe("dep@family.com");
    // The dependant is LINKED to the principal (resolved from the National ID).
    expect(d.principalId).toBe("principalMember");
    expect(d.relationship).toBe("CHILD");
    expect(d).toMatchObject({
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira",
      addressSubcounty: "Namugongo",
      addressParish: "Kyaliwajjala",
      addressVillage: "Buwate",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsentAt: expect.any(Date),
    });
  });
});
