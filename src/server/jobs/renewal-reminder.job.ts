/**
 * renewal-reminder.job.ts
 * Sends renewal reminder notifications to group principals.
 * Triggered by: daily cron.
 *
 * Sends reminders at: 60 days, 30 days, 14 days, and 7 days before renewal.
 */

import { NotificationService } from "../services/notification.service";
import { prisma } from "@/lib/prisma";

const REMINDER_THRESHOLDS = [60, 30, 14, 7];

export async function runRenewalReminderJob() {
  console.info(`[renewal-reminder] Running renewal reminder job...`);

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    for (const tenant of tenants) {
      for (const days of REMINDER_THRESHOLDS) {
        const sent = await NotificationService.sendRenewalReminders(tenant.id, days);
        if (sent.length > 0) {
          console.info(`[renewal-reminder] Sent ${sent.length} reminders (${days}-day) for ${tenant.name}`);
        }
      }
    }

    console.info(`[renewal-reminder] Done.`);
  } catch (err) {
    console.error("[renewal-reminder] ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRenewalReminderJob();
