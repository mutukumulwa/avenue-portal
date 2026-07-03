/**
 * contract-lifecycle.job.ts
 * Digital-contract lifecycle transitions (spec §4.3), run daily:
 *  1. Auto-activate APPROVED contracts whose startDate has arrived.
 *  2. Auto-expire ACTIVE contracts past their endDate.
 *  3. NO_CONTRACT queue re-sweep — re-run the engine on claims that pended for
 *     "no contract" so newly-activated contracts pick them up.
 * Triggered by: daily cron (system queue).
 */

import { prisma } from "@/lib/prisma";
import { ContractLifecycleService } from "../services/contract-lifecycle.service";
import { ContractEngineIntegration } from "../services/contract-engine/persist";
import { getSystemActorId } from "../services/system-actor.service";

export async function runContractLifecycleJob() {
  console.info("[contract-lifecycle] Running...");
  const now = new Date();
  let activated = 0;
  let expired = 0;
  let reswept = 0;

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    const systemActorId = await getSystemActorId(tenant.id);

    // 1. Auto-activate APPROVED contracts whose start date has arrived.
    const due = await prisma.providerContract.findMany({
      where: { tenantId: tenant.id, status: "APPROVED", startDate: { lte: now }, endDate: { gte: now } },
      select: { id: true, contractNumber: true },
    });
    for (const c of due) {
      try {
        await ContractLifecycleService.activate(tenant.id, c.id, systemActorId);
        activated++;
      } catch (e) {
        console.error(`[contract-lifecycle] auto-activate failed for ${c.contractNumber}:`, e instanceof Error ? e.message : e);
      }
    }

    // 2. Auto-expire ACTIVE contracts past their end date.
    const toExpire = await prisma.providerContract.findMany({
      where: { tenantId: tenant.id, status: "ACTIVE", endDate: { lt: now } },
      select: { id: true, providerId: true },
    });
    if (toExpire.length > 0) {
      await prisma.providerContract.updateMany({
        where: { id: { in: toExpire.map(c => c.id) } },
        data: { status: "EXPIRED" },
      });
      expired += toExpire.length;
    }

    // 3. Re-sweep NO_CONTRACT-queued claims when contracts were activated.
    if (activated > 0) {
      const stuck = await prisma.claim.findMany({
        where: { tenantId: tenant.id, assignedQueue: "NO_CONTRACT" },
        select: { id: true },
        take: 500,
      });
      for (const claim of stuck) {
        const outcome = await ContractEngineIntegration.evaluateAndPersist(tenant.id, claim.id);
        if (outcome.result?.matched) reswept++;
      }
    }
  }

  console.info(`[contract-lifecycle] Done — ${activated} activated, ${expired} expired, ${reswept} re-swept.`);
  return { activated, expired, reswept };
}
