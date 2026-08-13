import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() =>
  vi.fn(async () => ({ user: { id: "hr-1", tenantId: "t1", groupId: "g1" } })),
);
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { HR: ["HR"] } }));

const endorsementCreate = vi.hoisted(() => vi.fn());
// DEF-028: the HR path now runs the same identity probe as the admin path, so
// the mock needs a member delegate. Returning null = no existing match, which
// keeps these P05.06 cases on the happy path they were written for.
const memberFindFirst = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    endorsement: { create: endorsementCreate },
    member: { findFirst: memberFindFirst },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));

import { addMemberEndorsementAction } from "@/app/(hr)/hr/roster/new/actions";

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    firstName: "Amina",
    lastName: "Kato",
    dateOfBirth: "1990-01-01",
    effectiveDate: "2026-08-13",
    gender: "FEMALE",
    relationship: "PRINCIPAL",
    addressCountry: "Uganda",
    sourceReference: "HR-LTR-2026-0042",
    ...overrides,
  })) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  endorsementCreate.mockResolvedValue({ id: "e1", endorsementNumber: "REQ-2026-12345" });
});

describe("P05.06 HR member addition uses the shared input contract", () => {
  it("refuses malformed phone input before creating an endorsement", async () => {
    const result = await addMemberEndorsementAction(null, form({ phone: "12345" }));
    expect(result).toMatchObject({
      error: expect.stringMatching(/highlighted/i),
      fieldErrors: { phone: [expect.stringMatching(/Ugandan phone/i)] },
    });
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("rejects forged enum and email values before creating an endorsement", async () => {
    const result = await addMemberEndorsementAction(
      null,
      form({ gender: "UNKNOWN", relationship: "COUSIN", email: "bad" }),
    );
    expect(result).toMatchObject({
      fieldErrors: {
        gender: [expect.stringMatching(/valid gender/i)],
        relationship: [expect.stringMatching(/valid relationship/i)],
        email: [expect.stringMatching(/valid email/i)],
      },
    });
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("requires a principal identity for a dependant request", async () => {
    const result = await addMemberEndorsementAction(
      null,
      form({ relationship: "CHILD", dateOfBirth: "2015-01-01" }),
    );
    expect(result).toMatchObject({
      fieldErrors: { principalIdNumber: [expect.stringMatching(/family unit/i)] },
    });
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("refuses a request that approval could never action because evidence is missing", async () => {
    const result = await addMemberEndorsementAction(null, form({ sourceReference: "" }));
    expect(result).toMatchObject({
      fieldErrors: { sourceReference: [expect.stringMatching(/document reference/i)] },
    });
    expect(endorsementCreate).not.toHaveBeenCalled();
  });

  it("persists exact dates, normalized phone and the full address for approval", async () => {
    const result = await addMemberEndorsementAction(
      null,
      form({
        phone: "0772 555 042",
        addressDistrict: "Wakiso",
        addressLocality: "Kira Municipality",
        addressSubcounty: "Namugongo Division",
        addressParish: "Kyaliwajjala",
        addressVillage: "Buwate",
        addressLatitude: "0.347596",
        addressLongitude: "32.582520",
        addressCoordinateConsent: "on",
      }),
    );
    expect(result).toMatchObject({ success: true, resultingCoverStart: "2026-08-13" });
    const created = endorsementCreate.mock.calls[0][0].data;
    expect(created.effectiveDate).toEqual(new Date("2026-08-13T00:00:00.000Z"));
    expect(created.changeDetails).toMatchObject({
      dateOfBirth: "1990-01-01",
      phone: "+256772555042",
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira Municipality",
      addressSubcounty: "Namugongo Division",
      addressParish: "Kyaliwajjala",
      addressVillage: "Buwate",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsent: true,
      sourceReference: "HR-LTR-2026-0042",
    });
  });

  it("reports the exact newborn DOB that approval will apply", async () => {
    const result = await addMemberEndorsementAction(
      null,
      form({
        relationship: "CHILD",
        principalIdNumber: "CM1234",
        dateOfBirth: "2026-08-01",
        birthNotificationDate: "2026-08-11",
      }),
    );
    expect(result).toMatchObject({ success: true, resultingCoverStart: "2026-08-01" });
  });
});
