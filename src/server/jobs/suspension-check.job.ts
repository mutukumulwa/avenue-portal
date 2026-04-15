/**
 * suspension-check.job.ts
 * Marks overdue invoices and suspends groups that are severely overdue.
 * Triggered by: daily cron.
 *
 * Rules:
 * - Invoice overdue → mark as OVERDUE
 * - Group with invoices overdue > 60 days → suspend group and members
 */

import { BillingService } from "../services/billing.service";
import { prisma } from "@/lib/prisma";

const SUSPENSION_THRESHOLD_DAYS = 60;

async function runSuspensionCheckJob() {
  console.info(`[suspension-check] Running suspension check...`);

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    for (const tenant of tenants) {
      // Step 1: Mark overdue invoices
      const overdueResult = await BillingService.markOverdueInvoices(tenant.id);
      console.info(`[suspension-check] Marked ${overdueResult.count} invoices as OVERDUE for ${tenant.name}`);

      // Step 2: Find groups with severely overdue invoices
      const suspensionCutoff = new Date();
      suspensionCutoff.setDate(suspensionCutoff.getDate() - SUSPENSION_THRESHOLD_DAYS);

      const overdueGroups = await prisma.invoice.findMany({
        where: {
          tenantId: tenant.id,
          status: "OVERDUE",
          dueDate: { lt: suspensionCutoff },
        },
        select: { groupId: true },
        distinct: ["groupId"],
      });

      for (const { groupId } of overdueGroups) {
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        if (!group || group.status === "SUSPENDED") continue;

        await prisma.group.update({
          where: { id: groupId },
          data: {
            status: "SUSPENDED",
            suspendedAt: new Date(),
            suspensionReason: `Invoice overdue by more than ${SUSPENSION_THRESHOLD_DAYS} days.`,
          },
        });

        // Suspend active members in this group
        await prisma.member.updateMany({
          where: { groupId, status: "ACTIVE" },
          data: { status: "SUSPENDED" },
        });

        console.info(`[suspension-check] Suspended group ${group.name} (${groupId}) due to overdue invoice.`);
      }
    }

    console.info(`[suspension-check] Done.`);
  } catch (err) {
    console.error("[suspension-check] ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSuspensionCheckJob();
