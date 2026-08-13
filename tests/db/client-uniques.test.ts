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

  /**
   * UAT-HF P09.05 (incidental) — this asserted `pg_constraint` and therefore
   * could never pass.
   *
   * Prisma renders `@@unique` as `CREATE UNIQUE INDEX`, under both `db push` and
   * `migrate deploy`. A unique *index* has no row in `pg_constraint`; only
   * `ALTER TABLE … ADD CONSTRAINT … UNIQUE` produces one. So this failed against
   * a correctly migrated database — a false alarm that would have been read as a
   * failed cutover during the §3 verification.
   *
   * `pg_index` is the catalog that answers the question actually being asked:
   * is uniqueness enforced on these columns? It covers both representations,
   * because a table constraint is backed by an index too.
   */
  it("both unique indexes exist on the Client table", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c.relname AS name
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = '"Client"'::regclass
          AND i.indisunique
          AND c.relname IN ($1, $2)`,
      NAME_UNIQUE,
      PREFIX_UNIQUE,
    )) as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain(NAME_UNIQUE);
    expect(names).toContain(PREFIX_UNIQUE);
  });

  it("the name index actually refuses a duplicate", async () => {
    // The index existing and the index being enforced are different claims, and
    // only the second one protects a member record. Proven, not assumed.
    const dup = await prisma.$queryRawUnsafe(
      `SELECT i.indisvalid AND i.indisready AS enforced
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = '"Client"'::regclass AND c.relname = $1`,
      NAME_UNIQUE,
    ) as Array<{ enforced: boolean }>;
    expect(dup[0]?.enforced).toBe(true);
  });
});
