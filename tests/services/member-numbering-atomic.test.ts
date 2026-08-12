/**
 * UAT-HF P05.02 — atomic member numbering.
 *
 * Acceptance: "50 parallel enrollments receive 50 unique monotonic numbers with
 * no P2002 and no gaps caused by rolled-back transactions unless documented."
 *
 * The 50-way concurrency half of that acceptance cannot be proved with mocks —
 * it needs a real Postgres, and it was:
 *
 *   old algorithm: 50 concurrent allocations -> 1 unique number
 *                  (all 50 got OLD-2026-00001)
 *   new algorithm: 50 concurrent allocations -> 50 unique, contiguous 1..50
 *
 * measured on a disposable database and recorded in IMPLEMENTATION_LOG.md.
 * These tests pin the SHAPE that makes that true, so a refactor that quietly
 * reintroduces read-then-write fails here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const queryRaw = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw, client: { findFirst }, member: { findMany } },
}));

import { nextMemberNumber, DEFAULT_MEMBER_PREFIX } from "@/server/services/member-numbering.service";

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(null);
  queryRaw.mockResolvedValue([{ lastValue: 7 }]);
});

const YEAR = new Date().getFullYear();

describe("P05.02 allocation is one atomic statement", () => {
  it("formats the allocated value with the prefix, year and zero-padded suffix", async () => {
    expect(await nextMemberNumber("t1")).toBe(`${DEFAULT_MEMBER_PREFIX}-${YEAR}-00007`);
  });

  it("uses the client's prefix when there is one", async () => {
    findFirst.mockResolvedValue({ memberNumberPrefix: "NWSC" });
    expect(await nextMemberNumber("t1", "c1")).toBe(`NWSC-${YEAR}-00007`);
  });

  it("never reads the member table to find a maximum", async () => {
    await nextMemberNumber("t1");
    // Read-then-write is the defect. Two callers reading the same max mint the
    // same number, and the unique constraint turns that into a P2002 in the
    // operator's face rather than preventing it.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("allocates with a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING", async () => {
    await nextMemberNumber("t1");
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0][0] as { raw?: string[] }).raw?.join("?") ?? "";
    expect(sql).toMatch(/INSERT INTO "MemberNumberSequence"/);
    expect(sql).toMatch(/ON CONFLICT \("tenantId", "prefix", "year"\)/);
    expect(sql).toMatch(/DO UPDATE SET "lastValue" = "MemberNumberSequence"\."lastValue" \+ 1/);
    expect(sql).toMatch(/RETURNING "lastValue"/);
  });

  it("widens the pad rather than truncating past 99999", async () => {
    queryRaw.mockResolvedValue([{ lastValue: 100_000 }]);
    expect(await nextMemberNumber("t1")).toBe(`${DEFAULT_MEMBER_PREFIX}-${YEAR}-100000`);
  });

  it("accepts a transaction client, so a rolled-back enrolment is atomic with it", async () => {
    const tx = { $queryRaw: vi.fn(async () => [{ lastValue: 3 }]) };
    expect(await nextMemberNumber("t1", null, tx as never)).toBe(`${DEFAULT_MEMBER_PREFIX}-${YEAR}-00003`);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("P05.02 a failed allocation is loud", () => {
  it("throws rather than falling back to the racy path", async () => {
    queryRaw.mockResolvedValue([]);
    // A silent downgrade to max-plus-one is worse than a failure: it only shows
    // up under load, which is exactly when it does damage.
    await expect(nextMemberNumber("t1")).rejects.toThrow(/No member was created/);
  });

  it("throws on a nonsensical counter value", async () => {
    queryRaw.mockResolvedValue([{ lastValue: 0 }]);
    await expect(nextMemberNumber("t1")).rejects.toThrow(/allocation returned no value/i);
  });

  it("still refuses a malformed client prefix", async () => {
    findFirst.mockResolvedValue({ memberNumberPrefix: "bad prefix!" });
    await expect(nextMemberNumber("t1", "c1")).rejects.toThrow(/malformed prefix/i);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("P05.02 the backfill seeds from the existing maximum", () => {
  const sql = readFileSync(
    "prisma/migrations/20260812000900_member_number_sequence/migration.sql",
    "utf8",
  );

  it("seeds each series from the highest number already minted", () => {
    // Starting from zero would re-mint numbers that are in use.
    expect(sql).toMatch(/MAX\(split_part\("memberNumber", '-', 3\)::int\)/);
    expect(sql).toMatch(/GROUP BY "tenantId"/);
  });

  it("takes the maximum NUMERICALLY, not lexically", () => {
    // Past 99999 the pad widens and '…-100000' sorts before '…-99999' as text,
    // which would collapse the max and re-mint live numbers. Same trap
    // maxByNumericSuffix exists to avoid on the read path.
    expect(sql).toContain("::int");
    expect(sql).not.toMatch(/ORDER BY "memberNumber" DESC/);
  });

  it("only seeds from well-formed member numbers", () => {
    expect(sql).toContain("^[A-Z][A-Z0-9]{2,5}-[0-9]{4}-[0-9]+$");
  });

  it("keeps one series per tenant, prefix and year", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "MemberNumberSequence_tenantId_prefix_year_key"/);
  });
});
