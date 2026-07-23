/**
 * PNOS F1.8 — print the provider applicability-readiness report (READ-ONLY).
 *
 * The network-operations sign-off input for the D3 entitlement gate. Mutates
 * nothing; rerunnable. Provider rows are grouped by classification so repair
 * work (F1.9) targets MISSING_APPLICABILITY / CONTRADICTORY / ORPHANED_RULES.
 *
 *   npx tsx scripts/pnos-applicability-readiness.ts               # all tenants
 *   npx tsx scripts/pnos-applicability-readiness.ts --tenant <id> # one tenant
 */
import { ProviderApplicabilityReadinessService } from "@/server/services/provider-applicability-readiness.service";
import { prisma } from "@/lib/prisma";

async function main() {
  const tIdx = process.argv.indexOf("--tenant");
  const tenantId = tIdx >= 0 ? process.argv[tIdx + 1] : undefined;

  const report = await ProviderApplicabilityReadinessService.report({ tenantId });

  console.log(`\nPNOS F1.8 — applicability readiness${tenantId ? ` (tenant ${tenantId})` : " (all tenants)"}`);
  console.log("Totals:", JSON.stringify(report.totals, null, 2));
  console.log(`Gate ready (every active provider COMPLETE): ${report.gateReady ? "YES" : "NO"}\n`);

  const needsWork = report.rows.filter((r) => r.classification !== "COMPLETE" && r.classification !== "INACTIVE_PROVIDER");
  if (needsWork.length === 0) {
    console.log("No active providers need repair input.");
  } else {
    console.log("Providers needing repair (safe input for F1.9 — no assumptions made):");
    for (const r of needsWork) {
      console.log(
        `  [${r.classification}] ${r.providerName} (${r.providerId})  ` +
          `activeContracts=${r.activeContracts} include=${r.effectiveIncludeRules} exclude=${r.effectiveExcludeRules} ` +
          `contradictions=${r.contradictions} orphans=${r.orphanRules} expired=${r.expiredContracts} future=${r.futureContracts}`,
      );
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
