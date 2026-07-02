/**
 * admin-fee-accrual.job.ts
 * Accrues recurring TPA admin fees (Medvex spec §2.3 / gap G2.3) for the
 * CURRENT period across every tenant: PMPM + FLAT_PER_INSURED from active
 * member counts, PCT_OF_CLAIMS from claims paid in the period.
 *
 * Runs daily — accrual is idempotent per agreement+period (non-invoiced
 * entries are refreshed), so the current month's ledger stays current as
 * membership and paid claims move.
 */

import { prisma } from "@/lib/prisma";
import { AdminFeeService } from "../services/admin-fee.service";

export async function runAdminFeeAccrualJob(now: Date = new Date()) {
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let entriesWritten = 0;
  for (const tenant of tenants) {
    const written = await AdminFeeService.accrueRecurringForPeriod(tenant.id, period);
    entriesWritten += written.length;
  }

  if (entriesWritten > 0) {
    console.info(`[admin-fee-accrual] period ${period}: ${entriesWritten} ledger entr(ies) accrued/refreshed`);
  }
  return { period, entriesWritten };
}
