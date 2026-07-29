/**
 * PNOS F2.9 — document-privacy readiness report (READ-ONLY).
 *
 * The evidence artifact for the §11.4 migration gate. It re-runs the inventory
 * and answers the three questions security needs before public read is removed:
 *   1. how far has the legacy backfill got (docs with/without a private key)?
 *   2. which source consumers still render a direct public `fileUrl`?
 *   3. is anonymous read currently open on a sample object?
 *
 * It changes NOTHING. Removing public access is an operator action taken only
 * after this report shows zero direct consumers AND security signs off.
 *
 *   npx tsx scripts/pnos-document-privacy-readiness.ts [--probe <objectUrl>]
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { publicDocumentsEnabled } from "@/lib/minio";

const SRC_ROOTS = ["src/app", "src/components", "src/server"];

/** Files that still reference a document `fileUrl` (candidate direct consumers). */
function scanDirectFileUrlConsumers(root = process.cwd()): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e);
      let s; try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) { if (e !== "node_modules" && e !== ".next") walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      const body = readFileSync(p, "utf8");
      // a *rendering* consumer dereferences .fileUrl (href/src/fetch), not just the column name
      if (/\.fileUrl\b/.test(body)) hits.push(p.replace(root + "/", ""));
    }
  };
  for (const r of SRC_ROOTS) walk(join(root, r));
  return hits.sort();
}

async function main() {
  const probeIdx = process.argv.indexOf("--probe");
  const probeUrl = probeIdx >= 0 ? process.argv[probeIdx + 1] : undefined;

  const [total, withKey, withoutKey, byScan] = await Promise.all([
    prisma.document.count(),
    prisma.document.count({ where: { storageKey: { not: null } } }),
    prisma.document.count({ where: { storageKey: null } }),
    prisma.document.groupBy({ by: ["scanStatus"], _count: { _all: true } }),
  ]);

  const consumers = scanDirectFileUrlConsumers();

  console.log("\nPNOS F2.9 — document privacy readiness (read-only)\n");
  console.log("1. Backfill progress");
  console.log(`   documents total: ${total}  with private storageKey: ${withKey}  still legacy (no key): ${withoutKey}`);
  console.log(`   by scanStatus: ${JSON.stringify(byScan.map((b) => ({ status: b.scanStatus ?? "LEGACY_NULL", n: b._count._all })))}`);

  console.log("\n2. Direct public-fileUrl consumers still in source");
  if (consumers.length === 0) console.log("   none — gate condition met");
  else consumers.forEach((c) => console.log(`   - ${c}`));

  console.log("\n3. Public-read posture");
  console.log(`   new buckets get a public policy: ${publicDocumentsEnabled() ? "YES (legacy default)" : "NO (private-by-default)"}`);
  if (probeUrl) {
    try {
      const res = await fetch(probeUrl, { method: "GET" });
      console.log(`   anonymous GET ${probeUrl} → HTTP ${res.status} ${res.status === 200 ? "(PUBLIC READ IS OPEN)" : "(denied)"}`);
    } catch (e) {
      console.log(`   anonymous GET failed to connect: ${(e as Error).message}`);
    }
  } else {
    console.log("   (pass --probe <objectUrl> to test anonymous read against a real object)");
  }

  const gateReady = consumers.length === 0 && withoutKey === 0;
  console.log(`\nGATE: ${gateReady ? "ready for security review" : "NOT ready"} — public-read removal requires zero direct consumers, zero un-backfilled docs, and security sign-off.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
