/**
 * UAT-HF P05.04 acceptance — "unprivileged responses never disclose the existing
 * person; authorized review is tenant/client scoped and audited; concurrent
 * exact-ID creation is stopped by DB constraint."
 *
 * DEF-078 (S2): 'Entering a phone number already held by another member returns
 * "Phone "+256700000111" is already assigned to Margaret Bukenya
 * (NWSC-2026-00362)" ... Anyone with enrolment access can therefore supply an
 * identifier and learn who holds it, one guess at a time.'
 *
 * DEC-07 is the governing policy: hard conflict is exact national ID ONLY;
 * "a principal and their dependants routinely share one number".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  DUPLICATE_REVIEW_PERMISSION,
  DuplicateIdentityError,
  MATCH_MESSAGE,
  blockingMatch,
  blockingMessage,
  candidateWarnings,
  findIdentityMatches,
  mayReviewDuplicates,
} from "@/server/services/identity-match.service";

const findFirst = vi.fn();
const db = { member: { findFirst, findMany: vi.fn() } } as never;

beforeEach(() => {
  findFirst.mockReset();
  findFirst.mockResolvedValue(null);
});

const HIT = { id: "m-other" };

describe("P05.04 what blocks and what does not (DEC-07)", () => {
  it("an exact national ID is a HARD conflict", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const matches = await findIdentityMatches(db, "t1", { nationalId: "CM12345678" });
    expect(matches).toEqual([
      { signal: "NATIONAL_ID", strength: "HARD", matchedMemberId: "m-other" },
    ]);
    expect(blockingMatch(matches)?.signal).toBe("NATIONAL_ID");
  });

  it("a shared phone is a CANDIDATE, never a block", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const matches = await findIdentityMatches(db, "t1", { phone: "+256700000111" });
    // DEC-07: "a principal and their dependants routinely share one number".
    // The pre-existing code threw here, which was both a disclosure and wrong.
    expect(matches[0].strength).toBe("CANDIDATE");
    expect(blockingMatch(matches)).toBeNull();
  });

  it("a shared email is a CANDIDATE, never a block", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const matches = await findIdentityMatches(db, "t1", { email: "shared@example.com" });
    expect(blockingMatch(matches)).toBeNull();
  });

  it("same name and DOB is a CANDIDATE — twins exist", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const matches = await findIdentityMatches(db, "t1", {
      firstName: "Amina",
      lastName: "Kato",
      dateOfBirth: "1990-01-01",
    });
    expect(matches[0]).toMatchObject({ signal: "NAME_DOB", strength: "CANDIDATE" });
    expect(blockingMatch(matches)).toBeNull();
  });

  it("no match at all is no warning and no block", async () => {
    const matches = await findIdentityMatches(db, "t1", {
      nationalId: "CM1",
      phone: "+256700000111",
      email: "a@b.com",
    });
    expect(matches).toEqual([]);
    expect(candidateWarnings(matches)).toEqual([]);
  });
});

describe("P05.04 no response ever names the other member", () => {
  it("a match carries only an opaque id — no name, no member number", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const [match] = await findIdentityMatches(db, "t1", { nationalId: "CM1" });
    // The disclosure was structural: the query SELECTed the name and number, so
    // they were available to interpolate. Now they are not fetched at all.
    expect(Object.keys(match)).toEqual(["signal", "strength", "matchedMemberId"]);
  });

  it("only selects the id from the database", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    await findIdentityMatches(db, "t1", { nationalId: "CM1" });
    expect(findFirst.mock.calls[0][0].select).toEqual({ id: true });
  });

  it("every user-facing message is free of name and member-number placeholders", () => {
    for (const [signal, message] of Object.entries(MATCH_MESSAGE)) {
      expect(message, signal).not.toMatch(/\$\{/);
      expect(message, signal).not.toMatch(/firstName|lastName|memberNumber/);
    }
  });

  it("the blocking message takes the MATCH, not the matched member", async () => {
    findFirst.mockResolvedValueOnce(HIT);
    const matches = await findIdentityMatches(db, "t1", { nationalId: "CM12345678" });
    const message = blockingMessage(blockingMatch(matches)!);
    expect(message).not.toContain("m-other");
    expect(message).toMatch(/already recorded against another member/i);
  });

  it("preserves outcome discovery without disclosing anyone", () => {
    findFirst.mockResolvedValueOnce(HIT);
    const message = blockingMessage({
      signal: "NATIONAL_ID",
      strength: "HARD",
      matchedMemberId: "m-other",
    });
    // The run noted the disclosed member number "was the sole means by which
    // that write's outcome became discoverable at all". Replaced, not dropped.
    expect(message).toMatch(/operation reference/i);
    expect(message).toMatch(/check the outcome before trying again/i);
    // And it says who CAN tell them, rather than leaving a dead end.
    expect(message).toMatch(/duplicate-review permission/i);
  });

  it("says plainly that nothing was saved", () => {
    expect(MATCH_MESSAGE.NATIONAL_ID).toMatch(/was not saved/i);
  });

  it("candidate messages say they are not blocks, so nobody retries pointlessly", () => {
    expect(MATCH_MESSAGE.PHONE).toMatch(/not a block/i);
    expect(MATCH_MESSAGE.EMAIL).toMatch(/not a block/i);
    expect(MATCH_MESSAGE.NAME_DOB).toMatch(/not a block/i);
  });
});

describe("P05.04 scoping", () => {
  it("every probe is confined to the tenant", async () => {
    await findIdentityMatches(db, "t1", {
      nationalId: "CM1",
      phone: "+256700000111",
      email: "a@b.com",
      firstName: "A",
      lastName: "B",
      dateOfBirth: "1990-01-01",
    });
    expect(findFirst).toHaveBeenCalledTimes(4);
    for (const call of findFirst.mock.calls) {
      expect(call[0].where.tenantId).toBe("t1");
    }
  });

  it("excludes the member being edited, so saving your own record is not a conflict", async () => {
    await findIdentityMatches(db, "t1", { nationalId: "CM1" }, { excludeMemberId: "m-self" });
    expect(findFirst.mock.calls[0][0].where.NOT).toEqual({ id: "m-self" });
  });

  it("normalises the national ID so spacing and case are one identity", async () => {
    await findIdentityMatches(db, "t1", { nationalId: "  ck 12 34 " });
    expect(findFirst.mock.calls[0][0].where.idNumber.equals).toBe("CK1234");
  });

  it("probes every Uganda phone shape of the same line", async () => {
    await findIdentityMatches(db, "t1", { phone: "0700123456" });
    const variants = findFirst.mock.calls[0][0].where.phone.in as string[];
    expect(variants).toContain("+256700123456");
    expect(variants).toContain("256700123456");
    expect(variants).toContain("0700123456");
  });

  it("skips the phone probe entirely for an unparseable number", async () => {
    await findIdentityMatches(db, "t1", { phone: "not a phone" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("skips probes for blank inputs rather than matching everything", async () => {
    await findIdentityMatches(db, "t1", { nationalId: "   ", phone: "", email: null });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("skips name+DOB unless all three are present and the date parses", async () => {
    await findIdentityMatches(db, "t1", { firstName: "A", lastName: "B" });
    await findIdentityMatches(db, "t1", { firstName: "A", lastName: "B", dateOfBirth: "nope" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("P05.04 authorized review is gated", () => {
  it("requires the explicit permission", () => {
    expect(mayReviewDuplicates([DUPLICATE_REVIEW_PERMISSION])).toBe(true);
    expect(mayReviewDuplicates(["members.read"])).toBe(false);
    expect(mayReviewDuplicates([])).toBe(false);
    expect(mayReviewDuplicates(undefined)).toBe(false);
  });
});

describe("P05.04 the error is typed, not string-matched", () => {
  it("carries the signal so a caller can map it to CONFLICT", () => {
    const err = new DuplicateIdentityError("nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DuplicateIdentityError");
    expect(err.signal).toBe("NATIONAL_ID");
  });
});

describe("P05.04 the disclosing messages are gone from the service", () => {
  const source = readFileSync("src/server/services/members.service.ts", "utf8");

  it("no longer interpolates a matched member's name or number", () => {
    // The exact shapes the run captured.
    expect(source).not.toMatch(/is already assigned to \$\{/);
    expect(source).not.toMatch(/already exists: \$\{/);
    expect(source).not.toMatch(/dup\.(firstName|lastName|memberNumber)/);
  });

  it("no duplicate probe selects a name or member number any more", () => {
    // Not fetching it is what makes the disclosure unreachable, rather than
    // relying on every future message being careful.
    expect(source).not.toMatch(/select: \{ memberNumber: true, firstName: true, lastName: true \}/);
  });

  it("routes both enrolment and edit through the one service", () => {
    expect(source).toContain("findIdentityMatches");
    expect(source).toContain("blockingMatch");
    // Two call sites: createMember and updateMember.
    expect(source.match(/findIdentityMatches\(/g)?.length).toBe(2);
  });
});
