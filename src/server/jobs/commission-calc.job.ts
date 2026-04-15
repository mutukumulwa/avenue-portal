/**
 * commission-calc.job.ts
 * Calculates broker commissions after each billing run.
 * Triggered by: monthly cron (2nd of each month, after billing-run).
 *
 * Usage: ts-node src/server/jobs/commission-calc.job.ts [YYYY-MM]
 */

import { CommissionService } from "../services/commission.service";
import { prisma } from "@/lib/prisma";

async function runCommissionCalcJob() {
  const period = process.argv[2] ?? new Date().toISOString().slice(0, 7);
  console.info(`[commission-calc] Calculating commissions for period: ${period}`);

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    for (const tenant of tenants) {
      console.info(`[commission-calc] Processing tenant: ${tenant.name}`);
      const commissions = await CommissionService.calculateCommissions(tenant.id, period);
      console.info(`[commission-calc] Created ${commissions.length} commission records for ${tenant.name}`);
    }

    console.info(`[commission-calc] Commission calculation complete.`);
  } catch (err) {
    console.error("[commission-calc] ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCommissionCalcJob();
