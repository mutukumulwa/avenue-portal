/**
 * GL coverage reconciliation report (Outstanding-Conditions Ticket 7 / §C4).
 *
 * Read-only. Lists fresh-workflow financial state changes that lack their GL
 * journal entry, per tenant, so finance can separate historical/imported gaps
 * from live-workflow correctness. Never mutates data — any backfill is a
 * separate, finance-approved migration.
 *
 * Usage:
 *   npx tsx scripts/gl-coverage-report.ts <tenantSlug> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 */
import { prisma } from "@/lib/prisma";
import { FinancialPostingCoverageService } from "@/server/services/financial-posting-coverage.service";

async function main() {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: npx tsx scripts/gl-coverage-report.ts <tenantSlug> [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]");
    process.exit(1);
  }
  const getFlag = (name: string) =>
    flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
  const from = getFlag("from") ? new Date(getFlag("from")!) : undefined;
  const to = getFlag("to") ? new Date(getFlag("to")!) : undefined;

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) {
    console.error(`Tenant "${slug}" not found.`);
    process.exit(1);
  }

  const summary = await FinancialPostingCoverageService.summarise(tenant.id, { from, to });

  console.log(`\nGL coverage — ${tenant.name} (${slug})`);
  console.log(`Window: ${from?.toISOString().slice(0, 10) ?? "all"} → ${to?.toISOString().slice(0, 10) ?? "all"}`);
  console.log(`Approved claims without a CLAIM_APPROVED JE: ${summary.unpostedClaimCount}`);
  console.log(`SETTLED batches without a SETTLEMENT_PAID JE: ${summary.unpostedBatchCount}`);

  if (summary.unpostedClaims.length) {
    console.log("\n  Unposted approved claims:");
    for (const c of summary.unpostedClaims.slice(0, 50)) {
      console.log(`    ${c.claimNumber} — ${c.status} — ${c.currency} ${c.approvedAmount.toLocaleString()}`);
    }
    if (summary.unpostedClaims.length > 50) console.log(`    …and ${summary.unpostedClaims.length - 50} more`);
  }
  if (summary.unpostedBatches.length) {
    console.log("\n  SETTLED batches without a journal:");
    for (const b of summary.unpostedBatches.slice(0, 50)) {
      console.log(`    ${b.id} — ${b.claimCount} claim(s) — ${b.totalAmount.toLocaleString()}`);
    }
  }

  console.log(summary.clean ? "\n✅ Fresh-workflow GL coverage is complete for this window.\n" : "\n⚠️  Coverage gaps found — investigate before finance sign-off (do NOT auto-backfill).\n");
  await prisma.$disconnect();
  process.exit(summary.clean ? 0 : 2);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
