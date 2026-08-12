/**
 * UAT-HF P00.04 — real-DB proof that `TreatmentExclusionRule` can never end up
 * with zero owners.
 *
 * The rule table carries an XOR CHECK (`exclusion_owner_xor`): exactly one of
 * `packageVersionId` / `providerContractId` must be set. Both relations are
 * optional, so Prisma's DEFAULT referential action is SET NULL — which nulls the
 * owner on delete and immediately violates that CHECK. The referential action and
 * the constraint contradicted each other, so deleting any `PackageVersion` failed
 * unless its exclusion rules were deleted by hand first. That was found during the
 * UAT-HF run while restoring production state, outside the scenario set.
 *
 * The fix is `onDelete: Cascade` on both relations. These tests prove the CHECK
 * still rejects bad writes AND that each owner deletion now succeeds and takes its
 * rules with it, rather than stranding a zero-owner row.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   ONBOARDING_INVARIANTS_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL                  = the same URL (services read @/lib/prisma at import)
 *
 * Driver (on a disposable DB that has had `prisma migrate deploy`):
 *   ONBOARDING_INVARIANTS_TEST_DB=postgresql://user@127.0.0.1:5432/throwaway \
 *   DATABASE_URL=$ONBOARDING_INVARIANTS_TEST_DB \
 *   npx vitest run tests/db/exclusion-owner-xor.test.ts
 *
 * Self-skips (green) when the env var is absent, so the default suite needs no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const DB_URL = process.env.ONBOARDING_INVARIANTS_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

const SUFFIX = "uathf-xor";

describe.skipIf(!URL_SET)("P00.04 TreatmentExclusionRule owner XOR", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  const id = (p: string) => `${p}-${SUFFIX}`;

  /** Insert a rule directly, bypassing every application-level guard. */
  const insertRule = (ruleId: string, packageVersionId: string | null, providerContractId: string | null) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "TreatmentExclusionRule"
         ("id","tenantId","packageVersionId","providerContractId","ruleCategory",
          "effectiveFrom","memberSafeExplanation")
       VALUES ($1,$2,$3,$4,'COSMETIC'::"TreatmentExclusionCategory", now(), 'test')`,
      ruleId,
      id("tenant"),
      packageVersionId,
      providerContractId,
    );

  const countRules = async (ruleId: string) => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "TreatmentExclusionRule" WHERE "id" = $1`,
      ruleId,
    )) as Array<{ n: number }>;
    return rows[0].n;
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));

    // Minimal owner graph: Tenant -> Package -> PackageVersion, Tenant -> Provider -> ProviderContract.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ($1,'UAT-HF XOR',$2, now())
       ON CONFLICT ("id") DO NOTHING`,
      id("tenant"),
      id("slug"),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Package" ("id","tenantId","name","annualLimit","contributionAmount","updatedAt")
       VALUES ($1,$2,'UAT-HF XOR pkg',1000,100, now()) ON CONFLICT ("id") DO NOTHING`,
      id("pkg"),
      id("tenant"),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PackageVersion" ("id","packageId","versionNumber","effectiveFrom")
       VALUES ($1,$2,1, now()) ON CONFLICT ("id") DO NOTHING`,
      id("pv"),
      id("pkg"),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Provider" ("id","tenantId","name","type","updatedAt")
       VALUES ($1,$2,'UAT-HF XOR provider','CLINIC'::"ProviderType", now())
       ON CONFLICT ("id") DO NOTHING`,
      id("prov"),
      id("tenant"),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ProviderContract"
         ("id","tenantId","providerId","contractNumber","title","startDate","endDate","updatedAt")
       VALUES ($1,$2,$3,$4,'UAT-HF XOR contract', now(), now(), now())
       ON CONFLICT ("id") DO NOTHING`,
      id("pc"),
      id("tenant"),
      id("prov"),
      id("cno"),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const sql of [
      `DELETE FROM "TreatmentExclusionRule" WHERE "tenantId" = $1`,
      `DELETE FROM "ProviderContract" WHERE "tenantId" = $1`,
      `DELETE FROM "Provider" WHERE "tenantId" = $1`,
      `DELETE FROM "PackageVersion" WHERE "packageId" = '${id("pkg")}'`,
      `DELETE FROM "Package" WHERE "tenantId" = $1`,
      `DELETE FROM "Tenant" WHERE "id" = $1`,
    ]) {
      await prisma.$executeRawUnsafe(sql, id("tenant")).catch(() => {});
    }
    await prisma.$disconnect?.();
  });

  it("the exclusion_owner_xor constraint exists on the table", async () => {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = '"TreatmentExclusionRule"'::regclass
          AND conname = 'exclusion_owner_xor'`,
    )) as Array<{ conname: string }>;
    expect(rows.map((r) => r.conname)).toContain("exclusion_owner_xor");
  });

  it("rejects a rule owned by BOTH a package version and a provider contract", async () => {
    await expect(insertRule(id("rule-both"), id("pv"), id("pc"))).rejects.toThrow(/exclusion_owner_xor/);
  });

  it("rejects a rule owned by NEITHER", async () => {
    await expect(insertRule(id("rule-none"), null, null)).rejects.toThrow(/exclusion_owner_xor/);
  });

  it("both owner foreign keys delete with CASCADE, not SET NULL", async () => {
    // Regression guard: a future `prisma db push` or a dropped onDelete would
    // silently restore SET NULL and reintroduce the contradiction.
    const rows = (await prisma.$queryRawUnsafe(
      // confdeltype is a Postgres `char`, which the Prisma driver cannot
      // deserialize — cast it to text.
      `SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint
        WHERE conrelid = '"TreatmentExclusionRule"'::regclass AND contype = 'f'`,
    )) as Array<{ conname: string; confdeltype: string }>;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.confdeltype).toBe("c"); // 'c' = CASCADE, 'n' = SET NULL
  });

  it("deleting the owning PackageVersion removes its rules instead of stranding them", async () => {
    const ruleId = id("rule-pv");
    await insertRule(ruleId, id("pv"), null);
    expect(await countRules(ruleId)).toBe(1);

    // Before the fix this threw, because SET NULL produced a zero-owner row.
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "PackageVersion" WHERE "id" = $1`, id("pv")),
    ).resolves.not.toThrow();
    expect(await countRules(ruleId)).toBe(0);
  });

  it("deleting the owning ProviderContract removes its rules instead of stranding them", async () => {
    const ruleId = id("rule-pc");
    await insertRule(ruleId, null, id("pc"));
    expect(await countRules(ruleId)).toBe(1);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "ProviderContract" WHERE "id" = $1`, id("pc")),
    ).resolves.not.toThrow();
    expect(await countRules(ruleId)).toBe(0);
  });
});
