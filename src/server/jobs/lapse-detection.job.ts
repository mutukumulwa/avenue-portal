/**
 * lapse-detection.job.ts — Process 12
 * Runs daily at 23:00 EAT (20:00 UTC).
 * Detects members with unpaid contributions past the grace period and lapses them.
 * Also expires catch-up windows that have passed their deadline.
 */

import { prisma } from "@/lib/prisma";
import { lifecycleService } from "../services/lifecycle.service";

export async function runLapseDetectionJob() {
  console.info("[lapse-detection] Starting...");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalLapsed  = 0;
  let totalExpired = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // ── Lapse detection ──────────────────────────────────────
    const candidateIds = await lifecycleService.detectLapseCandidates(tenantId);

    for (const memberId of candidateIds) {
      try {
        await lifecycleService.lapseMembership(memberId, tenantId, "system");
        totalLapsed++;
      } catch (err) {
        console.error(`[lapse-detection] Failed to lapse member ${memberId}:`, err);
      }
    }

    if (candidateIds.length > 0) {
      console.info(`[lapse-detection] Tenant ${tenant.name}: lapsed ${candidateIds.length} member(s)`);
    }

    // ── Expire catch-up windows ──────────────────────────────
    const expired = await prisma.membershipLapseRecord.updateMany({
      where: {
        tenantId,
        catchupExpired: false,
        reinstatedAt:   null,
        catchupDeadline: { lt: new Date() },
      },
      data: { catchupExpired: true },
    });

    if (expired.count > 0) {
      console.info(`[lapse-detection] Tenant ${tenant.name}: ${expired.count} catch-up window(s) expired`);
      totalExpired += expired.count;
    }
  }

  console.info(`[lapse-detection] Done — ${totalLapsed} lapsed, ${totalExpired} catch-up windows expired`);
  return { totalLapsed, totalExpired };
}
