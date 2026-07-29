/**
 * PNOS F5.4 — backfill existing claims into self-rooted submission chains.
 *
 * Usage:
 *   tsx scripts/pnos-backfill-claim-chains.ts               # DRY RUN (counts only)
 *   tsx scripts/pnos-backfill-claim-chains.ts --apply       # write chainRootClaimId = id
 *   tsx scripts/pnos-backfill-claim-chains.ts --apply --tenant <tenantId>
 *
 * Idempotent + batched (only null-root claims), so a re-run is a no-op. New claims are
 * self-rooted at intake, so this is a one-time migration for pre-F5.4 rows.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { backfillOriginalChains } from "@/server/services/claim-submission-chain/backfill";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tIdx = args.indexOf("--tenant");
  const tenantId = tIdx >= 0 ? args[tIdx + 1] : undefined;

  console.log(`[pnos-backfill-claim-chains] mode=${apply ? "APPLY" : "DRY-RUN"}${tenantId ? ` tenant=${tenantId}` : " (all tenants)"}`);
  const result = await backfillOriginalChains({ tenantId, dryRun: !apply });
  if (result.dryRun) {
    console.log(`[pnos-backfill-claim-chains] ${result.scanned} claim(s) would be self-rooted. Re-run with --apply.`);
  } else {
    console.log(`[pnos-backfill-claim-chains] self-rooted ${result.updated} claim(s) across ${result.batches} batch(es).`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
