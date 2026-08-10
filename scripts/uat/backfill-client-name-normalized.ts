/**
 * Backfill `Client.nameNormalized` (DEF-013/014, plan §7.1). Computes
 * normalizeLegalName(name) for every client and writes it where it differs from
 * the stored value. MUST run AFTER the column exists (db push adds it with
 * @default("")) and BEFORE `@@unique([operatorTenantId, nameNormalized])` is
 * applied, so the unique lands on real keys rather than a table full of "".
 *
 * Idempotent. DRY-RUN by default (prints the diff, writes nothing); pass APPLY=1
 * to actually write. Run the name-collision report first and resolve collisions,
 * or two clients that normalize to the same key will still block the unique after
 * this backfill.
 *
 *   # dry run
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-client-name-normalized.ts
 *   # apply
 *   APPLY=1 DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-client-name-normalized.ts
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
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, nameNormalized: true },
  });

  const toFix = clients
    .map((c) => ({ id: c.id, name: c.name, want: normalizeLegalName(c.name), have: c.nameNormalized }))
    .filter((c) => c.want !== c.have);

  console.log(`Clients scanned: ${clients.length}`);
  console.log(`Needing update: ${toFix.length}`);
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY-RUN (no writes)\n");

  for (const c of toFix) {
    console.log(`   ${c.id}  "${c.have}" -> "${c.want}"   (name="${c.name}")`);
    if (APPLY) {
      await prisma.client.update({ where: { id: c.id }, data: { nameNormalized: c.want } });
    }
  }

  if (!APPLY && toFix.length > 0) {
    console.log("\nDRY-RUN complete. Re-run with APPLY=1 to write these values.");
  } else if (APPLY) {
    console.log(`\nBackfill complete: ${toFix.length} client(s) updated.`);
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
