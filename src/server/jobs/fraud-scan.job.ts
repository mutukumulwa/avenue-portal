/**
 * fraud-scan.job.ts
 * Periodic configurable-rule fraud scan (Medvex spec §5.11 / gap G5.11).
 * Applies each client's effective FraudRule set (Uganda typologies: upcoding,
 * high-frequency, identity sharing, phantom billing) over recently received
 * claims and raises ClaimFraudAlert rows. Idempotent per (claim, rule code).
 *
 * Complements FraudService's synchronous intake heuristics: the scan catches
 * patterns that only emerge across claims (velocity, provider volume) or
 * after adjudication enriches the claim (contracted variance).
 */

import { prisma } from "@/lib/prisma";
import { FraudEngineService } from "../services/fraud-engine.service";

export async function runFraudScanJob(opts: { lookbackHours?: number } = {}) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let totalScanned = 0;
  let totalAlerts = 0;
  for (const tenant of tenants) {
    const { scanned, alertsCreated } = await FraudEngineService.scanRecentClaims(tenant.id, {
      lookbackHours: opts.lookbackHours ?? 24,
    });
    totalScanned += scanned;
    totalAlerts += alertsCreated;
  }

  if (totalAlerts > 0) {
    console.warn(`[fraud-scan] ${totalAlerts} alert(s) raised across ${totalScanned} claim(s)`);
  }
  return { totalScanned, totalAlerts };
}
