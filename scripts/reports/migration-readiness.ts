/**
 * UAT-HF P12.02 — the four dry-run reports the plan lists that had no script.
 *
 * P12.02 step 2 names nine checks to run before backfilling. Five already exist
 * as their own scripts:
 *
 *   identity ................ member-identity-preflight.ts
 *   invalid dates ........... contract-date-preflight.ts
 *   orphan dependants ....... orphaned-dependants.ts
 *   provider entitlement .... provider-entitlement-readiness.ts
 *   currency defaults ....... contract-currency-preflight.ts
 *
 * The remaining four are here: **numbering**, **unfinished imports**, **package
 * owner XOR** and **audit projection gaps**. They are grouped in one script
 * because none needs a decision of its own — each is a single query whose only
 * interesting answer is "not zero".
 *
 * Read-only by construction. There is no `--apply`: this script has no write
 * path to gate, which is a stronger guarantee than a dry-run flag. Every check
 * prints a count before its detail, and the process exits non-zero if any check
 * finds anything, so it can gate a deploy step.
 *
 * Run:
 *   DATABASE_URL="<direct 5432 url>" npx tsx scripts/reports/migration-readiness.ts
 */

import { prisma } from "../../src/lib/prisma";

interface Check {
  name: string;
  /** Why a non-zero result blocks a backfill. */
  why: string;
  run: () => Promise<{ count: number; detail: string[] }>;
}

const checks: Check[] = [
  {
    name: "Member numbering — duplicates within a tenant",
    why:
      "P05.02 replaced max-plus-one with a sequence table. A duplicate that predates it " +
      "means two members share a number, so a claim can be filed against the wrong person.",
    run: async () => {
      const rows = await prisma.$queryRaw<{ tenantId: string; memberNumber: string; n: bigint }[]>`
        SELECT "tenantId", "memberNumber", count(*) AS n
        FROM "Member"
        GROUP BY "tenantId", "memberNumber"
        HAVING count(*) > 1
        ORDER BY count(*) DESC
        LIMIT 50
      `;
      return {
        count: rows.length,
        detail: rows.map((r) => `${r.memberNumber}  ×${Number(r.n)}  tenant ${r.tenantId}`),
      };
    },
  },
  {
    name: "Member numbering — sequence behind the highest minted number",
    why:
      "If MemberNumberSequence.lastValue is below the highest number already in use, the " +
      "allocator will re-mint a live number and the unique index will reject the enrolment.",
    run: async () => {
      const rows = await prisma.$queryRaw<{ prefix: string; year: number; seq: number; minted: number }[]>`
        SELECT s."prefix", s."year", s."lastValue" AS seq,
               MAX(split_part(m."memberNumber", '-', 3)::int) AS minted
        FROM "MemberNumberSequence" s
        JOIN "Member" m
          ON m."tenantId" = s."tenantId"
         AND split_part(m."memberNumber", '-', 1) = s."prefix"
         AND split_part(m."memberNumber", '-', 2) = s."year"::text
        WHERE m."memberNumber" ~ '^[A-Z][A-Z0-9]{2,5}-[0-9]{4}-[0-9]+$'
        GROUP BY s."prefix", s."year", s."lastValue"
        HAVING s."lastValue" < MAX(split_part(m."memberNumber", '-', 3)::int)
      `;
      return {
        count: rows.length,
        detail: rows.map((r) => `${r.prefix}-${r.year}: sequence at ${r.seq}, highest minted ${r.minted}`),
      };
    },
  },
  {
    name: "Unfinished imports",
    why:
      "A batch left QUEUED or PROCESSING has rows that may or may not have committed. " +
      "Re-uploading the file before resolving it commits the same members twice (DEF-068).",
    run: async () => {
      const rows = await prisma.importBatch.findMany({
        where: { status: { in: ["QUEUED", "PROCESSING", "UNKNOWN"] } },
        select: { batchRef: true, status: true, createdAt: true, totalRows: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return {
        count: rows.length,
        detail: rows.map(
          (r) => `${r.batchRef}  ${r.status.padEnd(11)} ${r.totalRows} rows  raised ${r.createdAt.toISOString().slice(0, 10)}`,
        ),
      };
    },
  },
  {
    name: "Treatment exclusion owner XOR",
    why:
      "Each rule must belong to exactly one of a package version or a provider contract. " +
      "A row with both or neither has no owner, so no evaluator can decide whether it applies.",
    run: async () => {
      const rows = await prisma.$queryRaw<{ id: string; pv: string | null; pc: string | null }[]>`
        SELECT "id", "packageVersionId" AS pv, "providerContractId" AS pc
        FROM "TreatmentExclusionRule"
        WHERE ("packageVersionId" IS NULL) = ("providerContractId" IS NULL)
        LIMIT 50
      `;
      return {
        count: rows.length,
        detail: rows.map((r) => `${r.id}  version=${r.pv ?? "null"}  contract=${r.pc ?? "null"}`),
      };
    },
  },
  {
    name: "Audit projection gaps",
    why:
      "A domain event stuck PENDING or FAILED is a business effect with no audit row. " +
      "The effect is real and safe; the trail is missing, which matters at a dispute.",
    run: async () => {
      const rows = await prisma.domainEvent.groupBy({
        by: ["projectionState"],
        where: { projectionState: { in: ["PENDING", "FAILED"] } },
        _count: { _all: true },
      });
      const total = rows.reduce((n, r) => n + r._count._all, 0);
      return {
        count: total,
        detail: rows.map((r) => `${r.projectionState}: ${r._count._all}`),
      };
    },
  },
];

async function main() {
  console.log("\nUAT-HF P12.02 — migration readiness (read-only)\n");

  let findings = 0;
  for (const check of checks) {
    let result: { count: number; detail: string[] };
    try {
      result = await check.run();
    } catch (err) {
      // A check that cannot run is NOT a pass. Say so and fail the report —
      // a missing table or column is itself a readiness finding.
      console.log(`  ⚠  ${check.name}`);
      console.log(`     could not run: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}\n`);
      findings += 1;
      continue;
    }

    if (result.count === 0) {
      console.log(`  ✅ ${check.name}: 0`);
      continue;
    }

    findings += result.count;
    console.log(`  ❌ ${check.name}: ${result.count}`);
    console.log(`     ${check.why}`);
    for (const line of result.detail) console.log(`       ${line}`);
    console.log("");
  }

  if (findings === 0) {
    console.log("\n  All checks clear. Safe to proceed with the backfill step.\n");
  } else {
    console.log(
      `\n  ${findings} finding(s). Each needs a decision before backfilling — a script\n` +
        "  cannot choose which duplicate is the real member or which import to resume.\n",
    );
  }

  process.exitCode = findings > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
