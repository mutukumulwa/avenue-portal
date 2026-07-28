/**
 * PNOS F6.9 — settlement reconciliation job runner.
 *
 * Runs the independent I5/I6 reconciliation over a tenant's SETTLED batches,
 * storing a run + any exceptions. Invoke from a cron/worker or by an operator:
 *
 *   npx tsx scripts/pnos-reconcile-settlements.ts <tenantId> [--since=ISO]
 *
 * It NEVER repairs money — it only records mismatches for finance to investigate.
 */
import { prisma } from "@/lib/prisma";
import { SettlementReconciliationService } from "@/server/services/settlement-reconciliation/service";

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("Usage: pnos-reconcile-settlements.ts <tenantId> [--since=ISO]");
    process.exit(1);
  }
  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];
  const since = sinceArg ? new Date(sinceArg) : undefined;

  const res = await SettlementReconciliationService.runReconciliation(tenantId, { since });
  console.log(
    `Reconciliation run ${res.runId}: ${res.batchesChecked} batch(es) checked, ${res.exceptionsFound} exception(s)` +
      `${res.watermark ? `, watermark ${res.watermark.toISOString()}` : ""}.`,
  );
  if (res.exceptionsFound > 0) process.exitCode = 2; // signal to the caller that finance must review
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
