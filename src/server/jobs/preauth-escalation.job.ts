/**
 * preauth-escalation.job.ts
 * Scans pending pre-authorizations that have been sitting past their
 * escalationThresholdHours and notifies the escalated-to user.
 *
 * Triggered by: scheduled cron (every 30 minutes via worker).
 */

import { prisma } from "@/lib/prisma";
import { NotificationService } from "../services/notification.service";

export async function runPreauthEscalationJob() {
  console.info("[preauth-escalation] Scanning for overdue pre-authorizations…");

  const now = new Date();
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  let escalated = 0;

  for (const tenant of tenants) {
    // Find pending pre-auths with an escalation threshold that haven't been escalated yet
    const overdue = await prisma.preAuthorization.findMany({
      where: {
        tenantId: tenant.id,
        status: "SUBMITTED",
        escalationThresholdHours: { not: null },
        escalatedAt: null,
      },
      include: {
        member:      { select: { firstName: true, lastName: true, memberNumber: true } },
        provider:    { select: { name: true } },
        escalatedTo: { select: { id: true, email: true, firstName: true } },
      },
    });

    for (const pa of overdue) {
      if (!pa.escalationThresholdHours) continue;

      const hoursSinceSubmission =
        (now.getTime() - pa.createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceSubmission < pa.escalationThresholdHours) continue;

      // Mark as escalated
      await prisma.preAuthorization.update({
        where: { id: pa.id },
        data:  { escalatedAt: now },
      });

      // Notify the escalated-to user if configured
      if (pa.escalatedTo?.email) {
        await NotificationService.executeEmailDispatch({
          to:      pa.escalatedTo.email,
          subject: `Pre-Auth Escalation — ${pa.preauthNumber} requires your review`,
          body:    `Hi ${pa.escalatedTo.firstName},\n\nPre-authorization ${pa.preauthNumber} for member ${pa.member.firstName} ${pa.member.lastName} (${pa.member.memberNumber}) at ${pa.provider.name} has been pending for ${Math.round(hoursSinceSubmission)} hours and has been escalated to you for review.\n\nPlease log in to the Avenue Portal to action this request.`,
        });
      }

      // Log activity
      await prisma.activityLog.create({
        data: {
          entityType:  "PREAUTH",
          entityId:    pa.id,
          action:      "ESCALATED",
          description: `Pre-auth ${pa.preauthNumber} escalated after ${Math.round(hoursSinceSubmission)}h — threshold was ${pa.escalationThresholdHours}h`,
        },
      });

      escalated++;
    }
  }

  console.info(`[preauth-escalation] Done — ${escalated} pre-auth(s) escalated.`);
  return escalated;
}
