/**
 * renewal-reminder.job.ts
 * Manages the renewal pipeline per spec §11:
 *   90 days: flag group in renewal pipeline (renewalStatus = NOT_STARTED)
 *   60 days: dispatch renewal notice (per spec)
 *   30 days: escalate to SCHEME_MANAGER if not yet IN_PROGRESS or QUOTE_ISSUED
 *    7 days: critical alert to SENIOR_UNDERWRITER if not BOUND
 *
 * Triggered by: daily cron at 06:00 EAT.
 */

import { NotificationService } from "../services/notification.service";
import { prisma } from "@/lib/prisma";
import { renewalService } from "../services/renewal.service";

const REMINDER_THRESHOLDS = [60, 30, 14, 7];

export async function runRenewalReminderJob() {
  console.info("[renewal-reminder] Running renewal pipeline job...");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // ── Process 11 pipeline management ─────────────────────
    const pipeline = await renewalService.getPipeline(tenantId, 90);

    for (const group of pipeline) {
      const days = group.daysToRenewal;

      // 90+ days: ensure group is flagged in pipeline
      if (days <= 90 && !group.renewalStatus) {
        await prisma.group.update({
          where: { id: group.id },
          data:  { renewalStatus: "NOT_STARTED" },
        });
        console.info(`[renewal-reminder] Flagged ${group.name} in renewal pipeline (${days}d to renewal)`);
      }

      // 60 days: dispatch renewal notice (idempotent)
      if (days <= 60 && !group.noticeDispatched) {
        await renewalService.dispatchRenewalNotice(group.id, tenantId);
        console.info(`[renewal-reminder] Dispatched renewal notice to ${group.name}`);
      }

      // 30 days: escalate if not yet engaged
      if (days <= 30 && group.renewalStatus === "NOT_STARTED") {
        await prisma.activityLog.create({
          data: {
            entityType:  "GROUP",
            entityId:    group.id,
            groupId:     group.id,
            action:      "RENEWAL_ESCALATION_30D",
            description: `${group.name} renewal in ${days} days with no engagement — escalated to scheme manager`,
          },
        });
        console.warn(`[renewal-reminder] ESCALATION: ${group.name} not engaged (${days}d)`);
      }

      // 7 days: critical alert if not bound
      if (days <= 7 && !["BOUND","CANCELLED","WITHDRAWN"].includes(group.renewalStatus ?? "")) {
        await prisma.activityLog.create({
          data: {
            entityType:  "GROUP",
            entityId:    group.id,
            groupId:     group.id,
            action:      "RENEWAL_CRITICAL_7D",
            description: `CRITICAL: ${group.name} renewal in ${days} day(s) — not yet BOUND`,
          },
        });
        console.error(`[renewal-reminder] CRITICAL: ${group.name} renewal in ${days}d — status: ${group.renewalStatus ?? "unset"}`);
      }
    }

    // ── Legacy notification reminders ────────────────────────
    for (const days of REMINDER_THRESHOLDS) {
      const sent = await NotificationService.sendRenewalReminders(tenantId, days);
      if (sent.length > 0) {
        console.info(`[renewal-reminder] Sent ${sent.length} reminders (${days}-day) for ${tenant.name}`);
      }
    }
  }

  console.info("[renewal-reminder] Done.");
}
