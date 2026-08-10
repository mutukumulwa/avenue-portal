/**
 * Backfill `Group.nameNormalized` (WP-S1, plan §7.1). Computes
 * normalizeLegalName(name) for every scheme and writes it where it differs from
 * the stored value. MUST run AFTER the column exists (db push adds it with
 * @default("")) and BEFORE `@@unique([clientId, nameNormalized])` is applied, so
 * the unique lands on real keys rather than a table full of "".
 *
 * Idempotent. DRY-RUN by default (prints the diff, writes nothing); pass APPLY=1
 * to actually write. Run report-group-name-collisions.ts first and resolve
 * collisions, or two schemes that normalize to the same key within one client
 * will still block the unique after this backfill.
 *
 *   # dry run
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-group-name-normalized.ts
 *   # apply
 *   APPLY=1 DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-group-name-normalized.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { normalizeLegalName } from "../../src/lib/normalize";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const APPLY = process.env.APPLY === "1";

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const groups = await prisma.group.findMany({
    select: { id: true, name: true, nameNormalized: true },
  });

  const toFix = groups
    .map((g) => ({ id: g.id, name: g.name, want: normalizeLegalName(g.name), have: g.nameNormalized }))
    .filter((g) => g.want !== g.have);

  console.log(`Schemes scanned: ${groups.length}`);
  console.log(`Needing update: ${toFix.length}`);
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY-RUN (no writes)\n");

  for (const g of toFix) {
    console.log(`   ${g.id}  "${g.have}" -> "${g.want}"   (name="${g.name}")`);
    if (APPLY) {
      await prisma.group.update({ where: { id: g.id }, data: { nameNormalized: g.want } });
    }
  }

  if (!APPLY && toFix.length > 0) {
    console.log("\nDRY-RUN complete. Re-run with APPLY=1 to write these values.");
  } else if (APPLY) {
    console.log(`\nBackfill complete: ${toFix.length} scheme(s) updated.`);
  } else {
    console.log("\nNothing to backfill.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
