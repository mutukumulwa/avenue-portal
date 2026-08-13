/**
 * UAT-HF P05.01 — preflight for the national-ID unique constraint.
 *
 * The acceptance is "preflight is zero". This is the thing that has to reach
 * zero, and it must be run against a real database before
 * `20260812000800_member_national_id_unique` is applied — a unique index that
 * fails halfway through a production deploy is worse than no unique index.
 *
 * It reports, it does not repair. Two members sharing a national ID is either a
 * genuine duplicate person (merge) or a data-entry error (correct one of them),
 * and neither decision belongs to a script.
 *
 *   npx tsx scripts/reports/member-identity-preflight.ts
 *   npx tsx scripts/reports/member-identity-preflight.ts --json
 */

// The shared client, NOT `new PrismaClient()`: this project constructs Prisma
// with a pg driver adapter, and a bare constructor throws
// PrismaClientInitializationError — which a report only discovers on the day
// somebody needs it.
import { prisma } from "@/lib/prisma";

interface Collision {
  tenantId: string;
  nationalIdNormalized: string;
  members: number;
  memberNumbers: string[];
}

interface Unbackfilled {
  column: string;
  rows: number;
}

async function main() {
  const asJson = process.argv.includes("--json");

  // 1. The blocker: two members in one tenant holding the same national ID.
  const collisions = await prisma.$queryRaw<Collision[]>`
    SELECT "tenantId",
           "nationalIdNormalized",
           COUNT(*)::int              AS members,
           array_agg("memberNumber")  AS "memberNumbers"
      FROM "Member"
     WHERE "nationalIdNormalized" IS NOT NULL
     GROUP BY "tenantId", "nationalIdNormalized"
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC, "tenantId"
  `;

  // 2. Rows the backfill could not key. A NULL normalized column beside a
  //    non-NULL source means the value did not parse — for phones that is
  //    expected and fine (a non-UG number is not a phone identity), for the
  //    others it is worth a look.
  const unbackfilled: Unbackfilled[] = [];
  for (const [column, source] of [
    ["nationalIdNormalized", "idNumber"],
    ["phoneNormalized", "phone"],
    ["emailNormalized", "email"],
    ["memberNumberNormalized", "memberNumber"],
    ["searchNameNormalized", "firstName"],
  ] as const) {
    const [row] = await prisma.$queryRawUnsafe<{ rows: number }[]>(
      `SELECT COUNT(*)::int AS rows FROM "Member"
        WHERE "${source}" IS NOT NULL AND "${source}" <> '' AND "${column}" IS NULL`,
    );
    if (row.rows > 0) unbackfilled.push({ column, rows: row.rows });
  }

  const [{ total }] = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM "Member"
  `;

  if (asJson) {
    console.log(JSON.stringify({ total, collisions, unbackfilled }, null, 2));
  } else {
    console.log(`\nMember identity preflight — ${total} members\n`);

    if (collisions.length === 0) {
      console.log("  national ID collisions: 0  ✅  safe to apply the unique index");
    } else {
      console.log(`  national ID collisions: ${collisions.length}  ❌  DO NOT apply the unique index yet\n`);
      for (const c of collisions) {
        console.log(
          `    tenant ${c.tenantId}  id ${c.nationalIdNormalized}  ${c.members} members: ${c.memberNumbers.join(", ")}`,
        );
      }
      console.log(
        "\n  Each of these is either one person enrolled twice (merge) or a mistyped ID\n" +
          "  (correct one). Resolve them in the product, then re-run this.",
      );
    }

    if (unbackfilled.length > 0) {
      console.log("\n  Values that did not normalise:");
      for (const u of unbackfilled) {
        const note =
          u.column === "phoneNormalized"
            ? "  (expected — non-Uganda or malformed numbers are deliberately left unkeyed)"
            : "";
        console.log(`    ${u.column}: ${u.rows} rows${note}`);
      }
    }
    console.log("");
  }

  // Non-zero exit on a real blocker, so this can gate a deploy step.
  process.exitCode = collisions.length > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
