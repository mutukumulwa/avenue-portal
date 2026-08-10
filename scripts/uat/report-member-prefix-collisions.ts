/**
 * READ-ONLY collision report for `@@unique([operatorTenantId, memberNumberPrefix])`
 * (DEF-015, plan §7.1 / WP-1.2). Groups every client by tenant + member-number
 * prefix and lists any prefix held by more than one client — those block the
 * unique. The KNOWN blocker is that every default/fallback client holds "MVX",
 * so this report also enumerates the full MVX set per tenant WITH each client's
 * member count, so the deploy step can decide which single client keeps "MVX" and
 * which are governed-renamed (only where no members are minted; otherwise escalate
 * a member-renumbering decision). Never mutates anything.
 *
 * Run manually against UAT then prod:
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/report-member-prefix-collisions.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required (read-only report).");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function memberCount(clientId: string): Promise<number> {
  return prisma.member.count({ where: { group: { clientId } } });
}

async function main() {
  const clients = await prisma.client.findMany({
    select: { id: true, operatorTenantId: true, name: true, slug: true, status: true, memberNumberPrefix: true },
    orderBy: [{ operatorTenantId: "asc" }, { memberNumberPrefix: "asc" }],
  });

  const byKey = new Map<string, { tenantId: string; prefix: string; rows: typeof clients }>();
  for (const c of clients) {
    const key = `${c.operatorTenantId}::${c.memberNumberPrefix}`;
    const bucket = byKey.get(key) ?? { tenantId: c.operatorTenantId, prefix: c.memberNumberPrefix, rows: [] };
    bucket.rows.push(c);
    byKey.set(key, bucket);
  }

  const collisions = [...byKey.values()].filter((b) => b.rows.length > 1);

  console.log(`Clients scanned: ${clients.length}`);
  console.log(`Distinct (tenant, prefix) keys: ${byKey.size}`);
  console.log(`COLLISIONS (would block the unique): ${collisions.length}\n`);

  for (const b of collisions) {
    console.log(`tenant=${b.tenantId}  prefix="${b.prefix}"  count=${b.rows.length}`);
    for (const r of b.rows) {
      const members = await memberCount(r.id);
      console.log(
        `   - ${r.id}  status=${r.status}  slug=${r.slug}  members=${members}  name="${r.name}"` +
          (r.slug === "default" ? "   <-- default/fallback client (keep MVX)" : ""),
      );
    }
    console.log("");
  }

  if (collisions.length === 0) {
    console.log("CLEAN — safe to apply @@unique([operatorTenantId, memberNumberPrefix]).");
  } else {
    console.log(
      "NOT CLEAN — for each collision keep one canonical client on the prefix (the default/fallback " +
        "client for MVX) and governed-rename the rest via the audited edit path; escalate any renamed " +
        "client that already has minted members for a renumbering decision. No SQL hard-edits.",
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
