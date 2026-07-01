/**
 * approval-escalation.job.ts
 * Escalates approval requests whose current-level SLA has elapsed without a
 * decision (Medvex spec §3.1 / gap G3.1, slice 5). Marks them ESCALATED and
 * surfaces an alert to the step's escalation-target role. Intended to run on
 * the same cadence as sla-breach.job.ts.
 */

import { prisma } from "@/lib/prisma";
import { ApprovalMatrixService } from "../services/approval-matrix.service";

export async function runApprovalEscalationJob(now: Date = new Date()) {
  const pending = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    include: {
      matrix: { include: { steps: true } },
      decisions: true,
    },
  });

  let escalatedCount = 0;
  const alerts: Array<{ tenantId: string; requestId: string; targetRole: string | null }> = [];

  for (const req of pending) {
    if (!req.matrix) continue;
    const steps = ApprovalMatrixService.expandSteps(req.matrix);
    const step = steps.find((s) => s.level === req.currentLevel);
    if (!step || step.slaMinutes == null) continue;

    // Clock starts at the latest decision for this request, else its creation.
    const lastDecisionAt = req.decisions.reduce<Date | null>(
      (acc, d) => (!acc || d.decidedAt > acc ? d.decidedAt : acc),
      null,
    );
    const startedAt = lastDecisionAt ?? req.createdAt;
    const deadline = new Date(startedAt.getTime() + step.slaMinutes * 60_000);
    if (now <= deadline) continue;

    await prisma.approvalRequest.update({
      where: { id: req.id },
      data: { status: "ESCALATED" },
    });
    escalatedCount++;
    alerts.push({ tenantId: req.tenantId, requestId: req.id, targetRole: step.escalationTargetRole });
    console.warn(
      `[approval-escalation] request ${req.id} (level ${req.currentLevel}) past SLA ` +
        `${step.slaMinutes}m → ESCALATED${step.escalationTargetRole ? ` to ${step.escalationTargetRole}` : ""}`,
    );
  }

  if (escalatedCount > 0) {
    console.info(`[approval-escalation] escalated ${escalatedCount} approval request(s)`);
  }
  return { escalatedCount, alerts };
}
