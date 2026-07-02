/**
 * membership-activation.job.ts
 * Activates PENDING_ACTIVATION members whose coverStartDate has arrived.
 * Verifies first contribution received (INSURED) or minimum fund deposit (SELF_FUNDED).
 * Runs daily at 00:01 EAT (21:01 UTC prev day).
 *
 * Idempotent: uses coverStartDate <= today, not a run-once flag.
 * Handles missed days: processes ALL eligible members on next run.
 */

import { prisma } from "@/lib/prisma";
import { auditChainService } from "../services/audit-chain.service";
import { getSystemActorId } from "../services/system-actor.service";

export async function runMembershipActivationJob() {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // include all of today

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalActivated = 0;
  let totalLapsed = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // Find all PENDING_ACTIVATION members whose cover start has arrived
    const candidates = await prisma.member.findMany({
      where: {
        tenantId,
        status: "PENDING_ACTIVATION",
        coverStartDate: { lte: today },
      },
      select: {
        id: true, memberNumber: true, coverStartDate: true,
        groupId: true, tenantId: true,
      },
    });

    for (const member of candidates) {
      // Fetch group details separately to avoid nested-relation type inference issues
      const group = await prisma.group.findUnique({
        where: { id: member.groupId },
        select: { id: true, fundingMode: true },
      });
      if (!group) continue;

      let canActivate = false;

      if (group.fundingMode === "SELF_FUNDED") {
        // Self-funded: check FundDepositRequest
        const depositReq = await prisma.fundDepositRequest.findUnique({
          where: { groupId: group.id },
        });
        if (depositReq) {
          canActivate = Number(depositReq.receivedAmount) >= Number(depositReq.minimumToActivate);
        }
      } else {
        // Contribution-bearing: check first invoice has been paid or partially paid
        const paidInvoice = await prisma.invoice.findFirst({
          where: {
            tenantId, groupId: group.id,
            status: { in: ["PAID", "PARTIALLY_PAID"] },
          },
        });
        canActivate = !!paidInvoice;
      }

      if (canActivate) {
        await prisma.member.update({
          where: { id: member.id },
          data: { status: "ACTIVE", activationDate: today },
        });
        totalActivated++;

        await auditChainService.append({
          actorId: await getSystemActorId(tenantId),
          action: "MEMBER:ACTIVATED",
          module: "BINDING",
          entityType: "Member",
          entityId: member.id,
          payload: { memberNumber: member.memberNumber, coverStartDate: member.coverStartDate },
          tenantId,
          description: `Member ${member.memberNumber} activated on cover start date`,
        });
      } else {
        // Cover start arrived but payment not confirmed → lapse before activation
        // Only lapse if coverStartDate is MORE than 7 days old (grace period)
        const gracePeriodMs = 7 * 24 * 60 * 60 * 1000;
        const isExpiredGrace = member.coverStartDate &&
          (today.getTime() - member.coverStartDate.getTime()) > gracePeriodMs;

        if (isExpiredGrace) {
          await prisma.member.update({
            where: { id: member.id },
            data: { status: "LAPSED_BEFORE_ACTIVATION" },
          });
          totalLapsed++;

          await auditChainService.append({
            actorId: await getSystemActorId(tenantId),
            action: "MEMBER:LAPSED_BEFORE_ACTIVATION",
            module: "BINDING",
            entityType: "Member",
            entityId: member.id,
            payload: { memberNumber: member.memberNumber, coverStartDate: member.coverStartDate },
            tenantId,
            description: `Member ${member.memberNumber} lapsed before activation — no payment received within grace period`,
          });
        }
      }
    }

    if (candidates.length > 0) {
      console.info(`[membership-activation] Tenant ${tenant.name}: ${totalActivated} activated, ${totalLapsed} lapsed`);
    }
  }

  console.info(`[membership-activation] Done — ${totalActivated} activated, ${totalLapsed} lapsed before activation`);
  return { totalActivated, totalLapsed };
}
