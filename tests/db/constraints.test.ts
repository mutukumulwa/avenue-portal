/**
 * SP-4 — real-DB proof that the onboarding-invariant CHECK constraints exist and
 * actually reject a direct write. CHECK constraints are not expressible in the
 * Prisma schema, so `prisma db push` never manages them; this test is the drift
 * detector that catches a database where
 * prisma/sql/2026-08-10_onboarding_invariants.sql was never applied.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   ONBOARDING_INVARIANTS_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL                  = the same URL (services read @/lib/prisma at import)
 *
 * Driver (on a disposable UAT DB that has had db push AND the SQL file applied):
 *   ONBOARDING_INVARIANTS_TEST_DB=postgresql://user:pass@127.0.0.1:5432/throwaway \
 *   DATABASE_URL=$ONBOARDING_INVARIANTS_TEST_DB \
 *   npx vitest run tests/db/constraints.test.ts
 *
 * Self-skips (green) when the env var is absent, so `npm test` needs no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const DB_URL = process.env.ONBOARDING_INVARIANTS_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

const INSERT = `INSERT INTO "AnnualCoContributionCap"
  ("id","tenantId","packageId","individualCap","familyCap","createdAt","updatedAt")
  VALUES ($1,$2,$3,$4,$5, now(), now())`;

describe.skipIf(!URL_SET)("SP-4 AnnualCoContributionCap CHECK constraints", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
  });

  afterAll(async () => {
    await prisma?.$disconnect?.();
  });

  it("both named constraints exist on the table (pg_constraint)", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = '"AnnualCoContributionCap"'::regclass
         AND conname IN ('caps_family_gte_individual', 'caps_positive')`,
    )) as Array<{ conname: string }>;
    const names = rows.map((r) => r.conname);
    expect(names).toContain("caps_family_gte_individual");
    expect(names).toContain("caps_positive");
  });

  it("rejects a raw insert with family cap below individual cap", async () => {
    const uniq = `def027-${Date.now()}`;
    const attempt = prisma.$executeRawUnsafe(
      INSERT,
      `id-${uniq}`,
      "tenant-dummy",
      `pkg-${uniq}`,
      300000,
      299999,
    );
    await expect(attempt).rejects.toThrow(/caps_family_gte_individual/);
  });

  it("rejects a raw insert with a non-positive individual cap", async () => {
    const uniq = `pos-${Date.now()}`;
    const attempt = prisma.$executeRawUnsafe(
      INSERT,
      `id-${uniq}`,
      "tenant-dummy",
      `pkg-${uniq}`,
      0,
      null,
    );
    await expect(attempt).rejects.toThrow(/caps_positive/);
  });
});
