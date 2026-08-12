/**
 * WP-3.5C — member-numbering integrity.
 *
 *  - resolveMemberPrefix asserts the resolved prefix matches the Wave 1 format
 *    (PREFIX_RE) and throws on a malformed legacy prefix rather than silently
 *    minting bad member numbers.
 *  - nextMemberNumber picks the next suffix by NUMERIC comparison, not the DB's
 *    lexical order, so the series does not collapse past 99999 (where the
 *    zero-pad widens and "…-100000" sorts BEFORE "…-99999").
 *
 * Pure logic over a mocked prisma — no DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  member: { findMany: vi.fn(async () => [] as { memberNumber: string }[]) },
  // P05.02: allocation is a single raw INSERT ... ON CONFLICT ... RETURNING.
  $queryRaw: vi.fn(async () => [{ lastValue: 1 }]),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  DEFAULT_MEMBER_PREFIX,
  nextMemberNumber,
  peekMemberNumber,
  resolveMemberPrefix,
} from "@/server/services/member-numbering.service";

const YEAR = new Date().getFullYear();

beforeEach(() => {
  vi.clearAllMocks();
  db.member.findMany.mockResolvedValue([]);
});

describe("resolveMemberPrefix — defensive prefix-format assert (WP-3.5C)", () => {
  it("returns the client's prefix when it conforms to PREFIX_RE", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "LMU" });
    expect(await resolveMemberPrefix("t1", "c1")).toBe("LMU");
  });

  it("falls back to the Medvex default (no client-master read) with no client context", async () => {
    expect(await resolveMemberPrefix("t1")).toBe(DEFAULT_MEMBER_PREFIX);
    expect(db.client.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the default when the client has no stored prefix", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: null });
    expect(await resolveMemberPrefix("t1", "c1")).toBe(DEFAULT_MEMBER_PREFIX);
  });

  // The six unsafe categories (D3/C-004) plus a padded value — each must throw,
  // never be transformed or silently accepted, so a bad row cannot mint numbers.
  it.each([
    "lmu", // lowercase
    "AB", // too short (needs 3–6)
    "ABCDEFG", // too long
    "A B", // whitespace
    "L/U", // slash
    "O'B", // apostrophe
    "=SUM(", // formula-like
    "MVX ", // trailing space
  ])("throws on a non-conforming legacy prefix %o instead of minting bad numbers", async (bad) => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: bad });
    await expect(resolveMemberPrefix("t1", "c1")).rejects.toThrow(/malformed prefix/i);
  });
});

/**
 * UAT-HF P05.02 moved ALLOCATION off max-plus-one onto an atomic counter, and
 * the numeric-suffix property moved with the max-scanning code into
 * `peekMemberNumber` (previews only — a peek carries no reservation).
 *
 * The property is still worth pinning: `peekMemberNumber` is what an operator
 * is shown before enrolling, and a preview that collapses past 99999 would show
 * a number that is already in use. Allocation itself is covered by
 * `member-numbering-atomic.test.ts` and by the 50-way concurrency run recorded
 * in IMPLEMENTATION_LOG.md.
 */
describe("peekMemberNumber — numeric suffix ordering past 99999 (WP-3.5C)", () => {
  it("picks the true MAX by integer suffix across mixed 5- and 6-digit numbers", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "LMU" });
    // Lexical desc would pick "…-99999" (→ 100000, which ALREADY EXISTS = collision).
    // Numeric max is 100001 → the next number must be 100002.
    db.member.findMany.mockResolvedValue([
      { memberNumber: `LMU-${YEAR}-00500` },
      { memberNumber: `LMU-${YEAR}-99999` },
      { memberNumber: `LMU-${YEAR}-100000` },
      { memberNumber: `LMU-${YEAR}-100001` },
    ]);
    expect(await peekMemberNumber("t1", "c1")).toBe(`LMU-${YEAR}-100002`);
  });

  it("keeps 5-digit zero-padding stable below 100000", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "LMU" });
    db.member.findMany.mockResolvedValue([{ memberNumber: `LMU-${YEAR}-00099` }]);
    expect(await peekMemberNumber("t1", "c1")).toBe(`LMU-${YEAR}-00100`);
  });

  it("seeds 00001 for a fresh client-year series", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "LMU" });
    db.member.findMany.mockResolvedValue([]);
    expect(await peekMemberNumber("t1", "c1")).toBe(`LMU-${YEAR}-00001`);
  });

  it("propagates the prefix assert — a bad client prefix mints nothing (no series read)", async () => {
    db.client.findFirst.mockResolvedValue({ memberNumberPrefix: "lmu" });
    await expect(nextMemberNumber("t1", "c1")).rejects.toThrow(/malformed prefix/i);
    expect(db.member.findMany).not.toHaveBeenCalled();
  });
});
