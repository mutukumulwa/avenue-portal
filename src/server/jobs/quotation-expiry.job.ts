/**
 * quotation-expiry.job.ts
 * Moves SENT quotations past their validUntil date to EXPIRED.
 * Triggered: daily at 01:00 EAT via scheduler.
 */

import { prisma } from "@/lib/prisma";
import { quotationBuilderService } from "../services/quotation-builder.service";

export async function runQuotationExpiryJob() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalExpired = 0;

  for (const tenant of tenants) {
    const count = await quotationBuilderService.expireStale(tenant.id);
    if (count > 0) {
      console.info(`[quotation-expiry] Tenant ${tenant.name}: expired ${count} quotation(s)`);
    }
    totalExpired += count;
  }

  console.info(`[quotation-expiry] Done — ${totalExpired} total quotation(s) expired`);
  return { totalExpired };
}
