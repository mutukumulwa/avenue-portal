/**
 * WP-S1 — real-DB proof that the two scheme-identity unique indexes exist once
 * applied. Like the client uniques these ARE expressible in schema.prisma
 * (`@@unique`), so `prisma db push` manages them — but only AFTER the collision
 * reports are clean and nameNormalized is backfilled (plan §7.1):
 *   1. scripts/uat/report-group-name-collisions.ts        → clean
 *   2. scripts/uat/backfill-group-name-normalized.ts       → APPLY=1
 *   3. scripts/uat/report-group-registration-collisions.ts → clean
 *   4. prisma db push (direct 5432)
 * This test is the drift detector that the deploy step actually applied them.
 *
 * OPT-IN — runs only when BOTH are set (so it never touches a real/prod DB):
 *   ONBOARDING_INVARIANTS_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL                  = the same URL
 *
 * Self-skips (green) when the env var is absent, so `npm test` needs no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const DB_URL = process.env.ONBOARDING_INVARIANTS_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

const NAME_UNIQUE = "Group_clientId_nameNormalized_key";
const REG_UNIQUE = "Group_tenantId_registrationNumber_key";

describe.skipIf(!URL_SET)("WP-S1 Group identity unique indexes", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
  });

  afterAll(async () => {
    await prisma?.$disconnect?.();
  });

  /**
   * UAT-HF P09.05 (incidental) — was asserting `pg_constraint`, which a Prisma
   * `@@unique` never populates: it renders `CREATE UNIQUE INDEX`, and a unique
   * index lives in `pg_index` alone. See the same note in `client-uniques.test.ts`.
   */
  it("both unique indexes exist on the Group table", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.relname AS name
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = '"Group"'::regclass
          AND i.indisunique
          AND c.relname IN ($1, $2)`,
      NAME_UNIQUE,
      REG_UNIQUE,
    )) as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain(NAME_UNIQUE);
    expect(names).toContain(REG_UNIQUE);
  });
});
