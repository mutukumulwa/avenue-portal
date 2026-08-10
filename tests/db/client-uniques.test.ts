/**
 * SP-3 — real-DB proof that the two client-identity unique indexes exist once
 * applied (DEF-013/014/015). Unlike CHECK constraints these ARE expressible in
 * schema.prisma (`@@unique`), so `prisma db push` manages them — but only AFTER
 * the collision reports are clean and nameNormalized is backfilled + the MVX
 * prefix set is deduped (plan §7.1). This test is the drift detector that the
 * deploy step actually applied them.
 *
 * OPT-IN — runs only when BOTH are set (so it never touches a real/prod DB):
 *   ONBOARDING_INVARIANTS_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL                  = the same URL
 *
 * Driver (a disposable UAT DB that has had `db push` of this schema):
 *   ONBOARDING_INVARIANTS_TEST_DB=postgresql://user:pass@127.0.0.1:5432/throwaway \
 *   DATABASE_URL=$ONBOARDING_INVARIANTS_TEST_DB \
 *   npx vitest run tests/db/client-uniques.test.ts
 *
 * Self-skips (green) when the env var is absent, so `npm test` needs no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const DB_URL = process.env.ONBOARDING_INVARIANTS_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

const NAME_UNIQUE = "Client_operatorTenantId_nameNormalized_key";
const PREFIX_UNIQUE = "Client_operatorTenantId_memberNumberPrefix_key";

describe.skipIf(!URL_SET)("SP-3 Client identity unique indexes", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
  });

  afterAll(async () => {
    await prisma?.$disconnect?.();
  });

  it("both unique constraints exist on the Client table (pg_constraint)", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = '"Client"'::regclass
         AND contype = 'u'
         AND conname IN ($1, $2)`,
      NAME_UNIQUE,
      PREFIX_UNIQUE,
    )) as Array<{ conname: string }>;
    const names = rows.map((r) => r.conname);
    expect(names).toContain(NAME_UNIQUE);
    expect(names).toContain(PREFIX_UNIQUE);
  });
});
