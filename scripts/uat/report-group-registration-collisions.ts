/**
 * READ-ONLY collision report for `@@unique([tenantId, registrationNumber])` on
 * Group (WP-S1, plan §7.1). Groups every scheme that HAS a registration number by
 * tenant + registration number and lists any held by more than one scheme — those
 * are the rows that would make the unique index fail to apply. Schemes with a NULL
 * registration number never collide (multiple NULLs are allowed) and are skipped.
 *
 * The unique ships ONLY after this report is clean (or the duplicates are
 * dispositioned via a governed edit through the product UI — never a SQL delete).
 *
 * Run manually against UAT then prod (never by CI, never mutates anything):
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/report-group-registration-collisions.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required (read-only report).");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const groups = await prisma.group.findMany({
    where: { registrationNumber: { not: null } },
    select: { id: true, tenantId: true, clientId: true, name: true, registrationNumber: true },
    orderBy: [{ tenantId: "asc" }, { registrationNumber: "asc" }],
  });

  // (tenant → registrationNumber → groups[])
  const byKey = new Map<string, { tenantId: string; reg: string; rows: typeof groups }>();
  for (const g of groups) {
    const reg = g.registrationNumber as string;
    const key = `${g.tenantId}::${reg}`;
    const bucket = byKey.get(key) ?? { tenantId: g.tenantId, reg, rows: [] };
    bucket.rows.push(g);
    byKey.set(key, bucket);
  }

  const collisions = [...byKey.values()].filter((b) => b.rows.length > 1);

  console.log(`Schemes with a registration number: ${groups.length}`);
  console.log(`Distinct (tenant, registration) keys: ${byKey.size}`);
  console.log(`COLLISIONS (would block the unique): ${collisions.length}\n`);

  for (const b of collisions) {
    console.log(`tenant=${b.tenantId}  registration="${b.reg}"  count=${b.rows.length}`);
    for (const r of b.rows) {
      console.log(`   - ${r.id}  client=${r.clientId}  name="${r.name}"`);
    }
    console.log("");
  }

  if (collisions.length === 0) {
    console.log("CLEAN — safe to apply @@unique([tenantId, registrationNumber]).");
  } else {
    console.log(
      "NOT CLEAN — disposition each collision via a governed edit (product UI) before applying the unique.",
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
