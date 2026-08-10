/**
 * READ-ONLY collision report for `@@unique([operatorTenantId, nameNormalized])`
 * (DEF-013/014, plan §7.1). Groups every client by tenant + normalized legal
 * name and lists any normalized name held by more than one client — those are
 * the rows that would make the unique index fail to apply. The unique ships ONLY
 * after this report is clean (or the duplicates are dispositioned via a governed
 * rename through the product UI — never a SQL hard-delete).
 *
 * Run manually against UAT then prod (never by CI, never mutates anything):
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/report-client-name-collisions.ts
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
  const clients = await prisma.client.findMany({
    select: { id: true, operatorTenantId: true, name: true, slug: true, status: true },
    orderBy: [{ operatorTenantId: "asc" }, { name: "asc" }],
  });

  // (tenant → normalizedName → clients[])
  const byKey = new Map<string, { tenantId: string; norm: string; rows: typeof clients }>();
  for (const c of clients) {
    const norm = normalizeLegalName(c.name);
    const key = `${c.operatorTenantId}::${norm}`;
    const bucket = byKey.get(key) ?? { tenantId: c.operatorTenantId, norm, rows: [] };
    bucket.rows.push(c);
    byKey.set(key, bucket);
  }

  const collisions = [...byKey.values()].filter((b) => b.rows.length > 1);

  console.log(`Clients scanned: ${clients.length}`);
  console.log(`Distinct (tenant, normalized-name) keys: ${byKey.size}`);
  console.log(`COLLISIONS (would block the unique): ${collisions.length}\n`);

  for (const b of collisions) {
    console.log(`tenant=${b.tenantId}  normalized="${b.norm}"  count=${b.rows.length}`);
    for (const r of b.rows) {
      console.log(`   - ${r.id}  status=${r.status}  slug=${r.slug}  name="${r.name}"`);
    }
    console.log("");
  }

  if (collisions.length === 0) {
    console.log("CLEAN — safe to apply @@unique([operatorTenantId, nameNormalized]).");
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
