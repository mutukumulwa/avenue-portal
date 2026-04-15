/**
 * billing-run.job.ts
 * Generates monthly invoices for all active groups.
 * Triggered by: monthly cron (1st of each month) or manual admin trigger.
 *
 * Usage: ts-node src/server/jobs/billing-run.job.ts [YYYY-MM]
 */

import { BillingService } from "../services/billing.service";
import { prisma } from "@/lib/prisma";

async function runBillingJob() {
  const period = process.argv[2] ?? new Date().toISOString().slice(0, 7); // e.g., "2025-04"
  console.info(`[billing-run] Starting billing cycle for period: ${period}`);

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    for (const tenant of tenants) {
      console.info(`[billing-run] Processing tenant: ${tenant.name} (${tenant.id})`);
      const invoices = await BillingService.runMonthlyBillingCycle(tenant.id, period);
      console.info(`[billing-run] Generated ${invoices.length} invoices for ${tenant.name}`);
    }

    console.info(`[billing-run] Billing cycle complete.`);
  } catch (err) {
    console.error("[billing-run] ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBillingJob();
