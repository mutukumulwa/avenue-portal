/**
 * READ-ONLY collision report for `@@unique([clientId, nameNormalized])` on Group
 * (WP-S1, plan §7.1). Groups every scheme by CLIENT + normalized legal name and
 * lists any normalized name held by more than one scheme within the same client
 * — those are the rows that would make the unique index fail to apply. The unique
 * ships ONLY after this report is clean (or the duplicates are dispositioned via a
 * governed rename through the product UI — never a SQL hard-delete).
 *
 * Two schemes with the SAME normalized name under DIFFERENT clients are fine (the
 * unique is client-scoped) and are NOT reported.
 *
 * Run manually against UAT then prod (never by CI, never mutates anything):
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/report-group-name-collisions.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { normalizeLegalName } from "../../src/lib/normalize";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required (read-only report).");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const groups = await prisma.group.findMany({
    select: { id: true, clientId: true, tenantId: true, name: true, status: true },
    orderBy: [{ clientId: "asc" }, { name: "asc" }],
  });

  // (client → normalizedName → groups[])
  const byKey = new Map<string, { clientId: string; norm: string; rows: typeof groups }>();
  for (const g of groups) {
    const norm = normalizeLegalName(g.name);
    const key = `${g.clientId}::${norm}`;
    const bucket = byKey.get(key) ?? { clientId: g.clientId, norm, rows: [] };
    bucket.rows.push(g);
    byKey.set(key, bucket);
  }

  const collisions = [...byKey.values()].filter((b) => b.rows.length > 1);

  console.log(`Schemes scanned: ${groups.length}`);
  console.log(`Distinct (client, normalized-name) keys: ${byKey.size}`);
  console.log(`COLLISIONS (would block the unique): ${collisions.length}\n`);

  for (const b of collisions) {
    console.log(`client=${b.clientId}  normalized="${b.norm}"  count=${b.rows.length}`);
    for (const r of b.rows) {
      console.log(`   - ${r.id}  status=${r.status}  name="${r.name}"`);
    }
    console.log("");
  }

  if (collisions.length === 0) {
    console.log("CLEAN — safe to apply @@unique([clientId, nameNormalized]).");
  } else {
    console.log(
      "NOT CLEAN — disposition each collision via a governed rename (product UI) before applying the unique.",
    );
    process.exitCode = 1;
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
