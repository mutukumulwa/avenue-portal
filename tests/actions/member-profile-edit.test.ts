/**
 * UAT-HF P05.05 acceptance — "stale profile save changes nothing; profile form
 * cannot suspend/lapse/reinstate even with forged form data."
 *
 * DEF-077 is reproduced end to end: staff A saves, then staff B saves from the
 * copy loaded before A's change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() =>
  // UAT-HF P07.02: a real session always carries a role, and the lifecycle
  // policy now decides on it. Omitting it here made the fixture fail closed —
  // correct behaviour, incomplete fixture.
  vi.fn(async () => ({ user: { id: "mo-1", tenantId: "t1", role: "MEMBER_OPS" } })),
);
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { MEMBER_OPS: ["MEMBER_OPS"] } }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/member-status", () => ({
  memberTransitionAuditAction: () => "MEMBER_SUSPENDED",
  canEditTransition: (from: string) => from !== "TERMINATED",
}));

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findFirst } } }));

const updateProfile = vi.hoisted(() => vi.fn());
const changeStatus = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/members.service", () => ({
  MembersService: { updateProfile, changeStatus },
}));

import {
  updateMemberProfileAction,
  changeMemberStatusAction,
} from "@/app/(admin)/members/[id]/edit/actions";
import { EXPECTED_UPDATED_AT_FIELD } from "@/lib/concurrency";

const LOADED = new Date("2026-08-12T09:00:00.000Z");
const AFTER_A_SAVED = new Date("2026-08-12T09:01:00.000Z");

// The record as staff B loaded it — before staff A saved.
const AS_B_LOADED = {
  firstName: "Valid",
  lastName: "StaleWrite",
  otherNames: "",
  idNumber: "",
  dateOfBirth: "1990-01-01",
  gender: "MALE",
  phone: "",
  email: "",
  relationship: "PRINCIPAL",
};

// The record now, after staff A changed otherNames.
const CURRENT_ROW = {
  firstName: "Valid",
  lastName: "StaleWrite",
  otherNames: "AWinsFirst",
  idNumber: null,
  dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
  gender: "MALE",
  phone: null,
  email: null,
  relationship: "PRINCIPAL",
  updatedAt: AFTER_A_SAVED,
};

function form(overrides: Record<string, string> = {}, expectAt: Date | null = LOADED): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(AS_B_LOADED)) {
    fd.set(k, v); // what B is submitting
    fd.set(`__original_${k}`, v); // what B loaded
  }
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  if (expectAt) fd.set(EXPECTED_UPDATED_AT_FIELD, expectAt.toISOString());
  return fd;
}

const run = (fd: FormData) => updateMemberProfileAction("m1", null, fd);

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(CURRENT_ROW);
  updateProfile.mockResolvedValue("APPLIED");
  changeStatus.mockResolvedValue({ member: {}, previousStatus: "ACTIVE" });
});

describe("P05.05 a stale save changes nothing and says so", () => {
  it("returns a CONFLICT when the record moved underneath", async () => {
    updateProfile.mockResolvedValue("STALE");
    const result = await run(form({ lastName: "StaleTwo" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("CONFLICT");
  });

  it("keeps B's typed value so their work survives the rejection", async () => {
    updateProfile.mockResolvedValue("STALE");
    const result = await run(form({ lastName: "StaleTwo" }));
    if (result.ok) throw new Error("unreachable");
    const lastName = result.conflict?.fields.find((f) => f.field === "lastName");
    expect(lastName?.submitted).toBe("StaleTwo");
    expect(lastName?.current).toBe("StaleWrite");
  });

  it("shows A's committed change and marks it as one B never touched", async () => {
    updateProfile.mockResolvedValue("STALE");
    const result = await run(form({ lastName: "StaleTwo" }));
    if (result.ok) throw new Error("unreachable");
    const otherNames = result.conflict?.fields.find((f) => f.field === "otherNames");
    // The field the run watched vanish.
    expect(otherNames?.current).toBe("AWinsFirst");
    expect(otherNames?.untouched).toBe(true);
  });

  it("passes the loaded timestamp as the precondition", async () => {
    await run(form({ lastName: "StaleTwo" }));
    expect(updateProfile.mock.calls[0][3]).toMatchObject({ updatedAt: LOADED });
  });

  it("refuses to save at all when the form carries no precondition", async () => {
    const result = await run(form({ lastName: "StaleTwo" }, null));
    expect(updateProfile).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/reload the member/i);
  });
});

describe("P05.05 only the operator's own edits are written", () => {
  it("sends just the changed field, not the whole stale record", async () => {
    await run(form({ lastName: "StaleTwo" }));
    // Sending otherNames:"" here is what reverted A's change.
    expect(updateProfile.mock.calls[0][2]).toEqual({ lastName: "StaleTwo" });
  });

  it("writes nothing when the operator changed nothing", async () => {
    const result = await run(form());
    expect(updateProfile).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

describe("P05.06 profile input validation and address plumbing", () => {
  it("refuses malformed phone before calling the service", async () => {
    const result = await run(form({ phone: "12345" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors?.phone?.[0]).toMatch(/Ugandan phone/i);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("refuses forged enums and malformed email before calling the service", async () => {
    const result = await run(form({ gender: "UNKNOWN", relationship: "COUSIN", email: "bad" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors?.gender).toBeDefined();
    expect(result.fieldErrors?.relationship).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("sends the complete canonical address block when one address field changes", async () => {
    await run(
      form({
        addressCountry: "Uganda",
        addressDistrict: "Wakiso",
        addressLocality: "Kira Municipality",
        addressSubcounty: "Namugongo",
        addressParish: "Kyaliwajjala",
        addressVillage: "Buwate",
      }),
    );
    expect(updateProfile.mock.calls[0][2]).toMatchObject({
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressLocality: "Kira Municipality",
      addressSubcounty: "Namugongo",
      addressParish: "Kyaliwajjala",
      addressVillage: "Buwate",
      addressLatitude: "",
      addressLongitude: "",
      addressCoordinateConsent: "",
    });
  });
});

describe("P05.05 the profile form cannot change lifecycle status", () => {
  it("ignores a forged status field entirely", async () => {
    const result = await run(form({ lastName: "StaleTwo", status: "TERMINATED" }));
    expect(result.ok).toBe(true);
    // Not "rejected" — never even read. The action iterates a fixed field list,
    // so there is nothing for a forged value to bind to.
    expect(updateProfile.mock.calls[0][2]).not.toHaveProperty("status");
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("ignores a forged status even when it is the only thing submitted", async () => {
    const result = await run(form({ status: "SUSPENDED" }));
    expect(result.ok).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(changeStatus).not.toHaveBeenCalled();
  });
});

describe("P05.05 a status change is its own command, with a reason", () => {
  const statusForm = (values: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    return fd;
  };

  it("refuses without a reason", async () => {
    const result = await changeMemberStatusAction("m1", null, statusForm({ status: "SUSPENDED" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("VALIDATION");
    expect(result.fieldErrors?.reason).toBeDefined();
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("refuses a token reason", async () => {
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "SUSPENDED", reason: "x" }),
    );
    expect(result.ok).toBe(false);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("applies with a reason", async () => {
    findFirst.mockResolvedValue({ status: "ACTIVE", version: 2, firstName: "A", lastName: "B" });
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "SUSPENDED", reason: "Non-payment, per finance ticket 4821" }),
    );
    expect(result.ok).toBe(true);
    // P07.02: the version travels to the service as an optimistic precondition,
    // and suspension ends no cover so it needs no effective date.
    expect(changeStatus).toHaveBeenCalledWith("t1", "m1", "SUSPENDED", {
      effectiveAt: undefined,
      expectedVersion: 2,
    });
  });

  it("P07.02: refuses a role the lifecycle policy does not name", async () => {
    // Fail closed. A session whose role matches no policy entry cannot act,
    // rather than falling through to a permissive default.
    requireRole.mockResolvedValueOnce({ user: { id: "mo-1", tenantId: "t1", role: "BROKER" } });
    findFirst.mockResolvedValue({ status: "ACTIVE", version: 2, firstName: "A", lastName: "B" });
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "SUSPENDED", reason: "Non-payment, per finance ticket 4821" }),
    );
    expect(result.ok).toBe(false);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("P07.02: refuses termination with no checker", async () => {
    // The policy requires a second person. There is no UI for this yet
    // (P07.03), which is precisely why enforcing it now costs nothing.
    findFirst.mockResolvedValue({ status: "ACTIVE", version: 2, firstName: "A", lastName: "B" });
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "TERMINATED", reason: "Left the scheme on 31 August" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.message).toMatch(/second person/i);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("refuses a governed terminal state with an explanation, not a crash", async () => {
    findFirst.mockResolvedValue({ status: "TERMINATED", version: 2, firstName: "A", lastName: "B" });
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "ACTIVE", reason: "Customer asked to come back" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("FORBIDDEN");
    // P07.02 reworded this: the policy table answers with what the operator can
    // do about it rather than naming the internal state category.
    expect(result.message).toMatch(/already ended|separate governed process/i);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("is a no-op when the status is already what was asked for", async () => {
    findFirst.mockResolvedValue({ status: "ACTIVE", version: 2, firstName: "A", lastName: "B" });
    const result = await changeMemberStatusAction(
      "m1",
      null,
      statusForm({ status: "ACTIVE", reason: "Confirming current state" }),
    );
    expect(result.ok).toBe(true);
    expect(changeStatus).not.toHaveBeenCalled();
  });
});
