/**
 * UAT-HF — find the dependants DEF-031 created before it was fixed.
 *
 * "Submitting creates a live ACTIVE dependant with no principal, no family unit
 * and its own full Annual Limit of UGX 25,000,000 ... Three such orphaned CHILD
 * members were created during this run (UX26-2026-00010, -00011, -00012),
 * including the two controlled twins."
 *
 * The form and the service refuse this now. Nothing repairs what already exists,
 * and these are not cosmetic: each one holds a principal's entire benefit
 * ceiling and can claim against it.
 *
 * Reports, does not repair. Attaching an orphan to a principal is a decision
 * about a real family — which principal, from when, and whether their shared
 * limit is already spent — and none of that belongs to a script.
 *
 *   npx tsx scripts/reports/orphaned-dependants.ts
 *   npx tsx scripts/reports/orphaned-dependants.ts --json
 */

// The shared client, NOT `new PrismaClient()`: this project constructs Prisma
// with a pg driver adapter, and a bare constructor throws
// PrismaClientInitializationError — which a report only discovers on the day
// somebody needs it.
import { prisma } from "@/lib/prisma";

interface Orphan {
  id: string;
  memberNumber: string;
  relationship: string;
  status: string;
  groupName: string;
  annualLimit: string;
  enrolledAt: Date;
}

async function main() {
  const asJson = process.argv.includes("--json");

  const orphans = await prisma.$queryRaw<Orphan[]>`
    SELECT m."id",
           m."memberNumber",
           m."relationship"::text        AS relationship,
           m."status"::text              AS status,
           g."name"                      AS "groupName",
           COALESCE(p."annualLimit", 0)::text AS "annualLimit",
           m."enrollmentDate"            AS "enrolledAt"
      FROM "Member" m
      JOIN "Group"   g ON g."id" = m."groupId"
      LEFT JOIN "Package" p ON p."id" = m."packageId"
     WHERE m."relationship" <> 'PRINCIPAL'
       AND m."principalId" IS NULL
     ORDER BY m."enrollmentDate" DESC
  `;

  if (asJson) {
    console.log(JSON.stringify({ count: orphans.length, orphans }, null, 2));
  } else if (orphans.length === 0) {
    console.log("\n  Orphaned dependants: 0  ✅\n");
  } else {
    console.log(`\n  Orphaned dependants: ${orphans.length}  ❌\n`);
    console.log("  A dependant with no principal has no family unit, so it holds a");
    console.log("  principal's FULL annual limit and can claim against it.\n");
    for (const o of orphans) {
      console.log(
        `    ${o.memberNumber}  ${o.relationship.padEnd(8)} ${o.status.padEnd(20)} ` +
          `limit ${Number(o.annualLimit).toLocaleString()}  ${o.groupName}`,
      );
    }
    console.log(
      "\n  Each needs a decision, not a script: which principal, from when, and\n" +
        "  whether that family's shared limit is already spent. Re-run after fixing.\n",
    );
  }

  process.exitCode = orphans.length > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
