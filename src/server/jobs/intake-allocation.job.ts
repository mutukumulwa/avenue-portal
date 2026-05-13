/**
 * intake-allocation.job.ts
 * Distributes PENDING_ASSESSMENT quotations to available assessors (round-robin).
 * Triggered every 10 minutes by the scheduler.
 */

import { prisma } from "@/lib/prisma";
import { intakeService } from "../services/intake.service";

export async function runIntakeAllocationJob() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalAllocated = 0;

  for (const tenant of tenants) {
    const { allocated } = await intakeService.allocateWorkQueue(tenant.id);
    if (allocated > 0) {
      console.info(`[intake-allocation] Tenant ${tenant.name}: allocated ${allocated} quotation(s)`);
    }
    totalAllocated += allocated;
  }

  console.info(`[intake-allocation] Done — ${totalAllocated} total allocations`);
  return { totalAllocated };
}
