/**
 * WP-2.3 / WP-2.4 — real-DB proof that the additive structured-rule tables were
 * created by `prisma db push`. Unlike the SP-4 CHECK constraints (which live in a
 * SQL pack), these tables ship with the normal migration, so this is a lighter
 * "tables + key columns exist" drift detector.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   STRUCTURED_RULES_TEST_DB = postgres URL of a THROWAWAY database (post db push)
 *   DATABASE_URL             = the same URL (services read @/lib/prisma at import)
 *
 * Self-skips (green) when the env var is absent, so `npm test` needs no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const DB_URL = process.env.STRUCTURED_RULES_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

describe.skipIf(!URL_SET)("WP-2.3/2.4 structured-rule tables", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
  });

  afterAll(async () => {
    await prisma?.$disconnect?.();
  });

  it("both tables exist (to_regclass)", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT to_regclass('"TreatmentExclusionRule"') AS ex, to_regclass('"ReferralRule"') AS ref`,
    )) as Array<{ ex: string | null; ref: string | null }>;
    expect(rows[0].ex).not.toBeNull();
    expect(rows[0].ref).not.toBeNull();
  });

  it("TreatmentExclusionRule carries both owner columns (N-012 dual ownership)", async () => {
    const cols = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'TreatmentExclusionRule'
         AND column_name IN ('packageVersionId','providerContractId','memberSafeExplanation')`,
    )) as Array<{ column_name: string }>;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(["packageVersionId", "providerContractId", "memberSafeExplanation"]));
  });

  it("ReferralRule carries the version FK + referral flags", async () => {
    const cols = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ReferralRule'
         AND column_name IN ('packageVersionId','requiresReferral','emergencyException')`,
    )) as Array<{ column_name: string }>;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(["packageVersionId", "requiresReferral", "emergencyException"]));
  });
});
