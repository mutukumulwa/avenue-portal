import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P05.04 — resolving a duplicate match to a person.
 *
 * The enrolment form deliberately cannot say who holds a national ID: the run's
 * operator learned the outcome of a lost write from a disclosed member number
 * belonging to a *different client group*. Blocking that was right, and it left
 * the hole P05.04's log recorded — "no route resolves a match to a person, so
 * an operator who hits a hard conflict cannot get the answer from anyone
 * in-product." They ring a colleague, or they create the second record the
 * block existed to prevent.
 */

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { member: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));

import {
  resolveDuplicateMatch,
  DUPLICATE_REVIEW_PERMISSION,
} from "@/server/services/duplicate-review.service";

const REVIEWER = { id: "u_rev", permissions: [DUPLICATE_REVIEW_PERMISSION] };

const call = (over: Record<string, unknown> = {}) =>
  resolveDuplicateMatch({
    tenantId: "t1",
    matchedMemberId: "m_other",
    signal: "NATIONAL_ID",
    reviewer: REVIEWER,
    purpose: "Enrolling a joiner who hit a hard conflict",
    ...over,
  } as Parameters<typeof resolveDuplicateMatch>[0]);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.writeAudit.mockResolvedValue(undefined);
  mocks.findFirst.mockResolvedValue({
    id: "m_other",
    memberNumber: "NWSC-2026-00001",
    firstName: "Grace",
    lastName: "Auma",
    status: "ACTIVE",
    group: { name: "NWSC Head Office" },
  });
});

describe("who may ask", () => {
  it("refuses without the permission, and says what to do instead", () => {
    return call({ reviewer: { id: "u1", permissions: [] } }).then((r) => {
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("NOT_PERMITTED");
      // The failure mode this whole surface exists to prevent.
      expect(r.message).toMatch(/rather than creating a second record/i);
    });
  });

  it("does not read the member at all when refused", async () => {
    await call({ reviewer: { id: "u1", permissions: undefined } });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("is gated on a permission, not a role", () => {
    // A role gate would hand this to everyone who happens to be MEMBER_OPS.
    expect(DUPLICATE_REVIEW_PERMISSION).toBe("member.duplicate.review");
  });
});

describe("what the reviewer gets", () => {
  it("returns enough to judge: name, number, scheme, status", async () => {
    const r = await call();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.match).toMatchObject({
      fullName: "Grace Auma",
      memberNumber: "NWSC-2026-00001",
      schemeName: "NWSC Head Office",
      status: "ACTIVE",
    });
  });

  it("returns nothing more than that", async () => {
    // Minimum necessary: DOB, national ID, address and contact details are not
    // needed to answer "is this the same person?", so they are not selected.
    await call();
    const select = mocks.findFirst.mock.calls[0][0].select;
    for (const forbidden of ["dateOfBirth", "idNumber", "nationalIdNormalized", "phone", "email", "addressLine"]) {
      expect(select[forbidden], forbidden).toBeUndefined();
    }
  });

  it("scopes the read to the tenant", async () => {
    await call();
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ id: "m_other", tenantId: "t1" });
  });

  it("does NOT scope by client — that is the whole point", async () => {
    // The match may be in another client group within the tenant, which is
    // exactly why the enrolment form cannot answer. The audit row is what makes
    // reaching across acceptable.
    await call();
    expect(mocks.findFirst.mock.calls[0][0].where.clientId).toBeUndefined();
  });
});

describe("the audit is the price of the answer", () => {
  it("records the reveal with its purpose", async () => {
    await call();
    const entry = mocks.writeAudit.mock.calls[0][0];
    expect(entry.action).toBe("MEMBER_DUPLICATE_RESOLVED");
    expect(entry.userId).toBe("u_rev");
    expect(entry.metadata).toMatchObject({ matchedMemberId: "m_other", signal: "NATIONAL_ID" });
    expect(entry.metadata.purpose).toMatch(/hard conflict/i);
  });

  it("does not hand over a name if the audit write fails", async () => {
    // A reveal that fails to record itself must not still disclose.
    mocks.writeAudit.mockRejectedValue(new Error("audit down"));
    await expect(call()).rejects.toThrow(/audit down/);
  });
});

describe("DEC-07 — a shared signal is not a duplicate", () => {
  it("warns when the match is on a phone number", async () => {
    const r = await call({ signal: "PHONE" });
    if (!r.ok) return;
    // Households and small employers share one number. Merging on it would
    // block a spouse from enrolling.
    expect(r.match.sharedSignalCaveat).toMatch(/shared phone number is normal/i);
  });

  it("warns on name + date of birth, which can coincide", async () => {
    const r = await call({ signal: "NAME_DOB" });
    if (!r.ok) return;
    expect(r.match.sharedSignalCaveat).toMatch(/can coincide/i);
  });

  it("adds no caveat to a national-ID match", async () => {
    // A national ID is unique by construction; a caveat here would soften a
    // signal that should not be softened.
    const r = await call({ signal: "NATIONAL_ID" });
    if (!r.ok) return;
    expect(r.match.sharedSignalCaveat).toBeNull();
  });
});

describe("a stale match", () => {
  it("reports the record is gone rather than inventing one", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const r = await call();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("NOT_FOUND");
    expect(r.message).toMatch(/re-run the check/i);
  });
});
