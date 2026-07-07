import { prisma } from "@/lib/prisma";
import { MemberAppService } from "@/server/services/member-app.service";
import type { MemberNotificationPriority, MemberNotificationType, Prisma } from "@prisma/client";

export type CreateMemberNotificationInput = {
  tenantId: string;
  memberId: string;
  type: MemberNotificationType;
  title: string;
  body: string;
  href?: string;
  priority?: MemberNotificationPriority;
  metadata?: Prisma.InputJsonValue;
};

function typeLabel(type: string) {
  return type.replace(/_/g, " ").toLowerCase();
}

export class MemberNotificationService {
  static async create(input: CreateMemberNotificationInput) {
    return prisma.memberNotification.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        type: input.type,
        priority: input.priority ?? "NORMAL",
        title: input.title,
        body: input.body,
        href: input.href,
        metadata: input.metadata,
      },
    });
  }

  /**
   * Emit a claim-lifecycle notification for a single claim's member. The
   * notification is delivered to the patient's record AND — when the patient is
   * a dependant — the principal's record, so the family member who actually
   * holds the portal login sees it. Fire-and-forget: it must never break the
   * claim/decision/settlement flow that calls it.
   */
  static async notifyForClaim(input: {
    tenantId: string;
    memberId: string;
    type: MemberNotificationType;
    title: string;
    body: string;
    href?: string;
    priority?: MemberNotificationPriority;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      const member = await prisma.member.findUnique({
        where: { id: input.memberId },
        select: { id: true, principalId: true },
      });
      if (!member) return;
      const targets = new Set<string>([member.id]);
      if (member.principalId) targets.add(member.principalId);
      for (const memberId of targets) {
        await prisma.memberNotification.create({
          data: {
            tenantId: input.tenantId,
            memberId,
            type: input.type,
            priority: input.priority ?? "NORMAL",
            title: input.title,
            body: input.body,
            href: input.href,
            metadata: input.metadata,
          },
        });
      }
    } catch (err) {
      console.error("[member-notification] notifyForClaim failed:", err);
    }
  }

  /**
   * Emit a "claim paid" notification for every claim in a settled batch, in a
   * single efficient write (2 queries regardless of batch size — safe for large
   * monthly batches). Runs AFTER the settlement transaction commits; never
   * throws.
   */
  static async notifyPaidBatch(tenantId: string, batchId: string) {
    try {
      const claims = await prisma.claim.findMany({
        where: { settlementBatchId: batchId },
        select: {
          id: true, claimNumber: true, memberId: true, currency: true, approvedAmount: true,
          member: { select: { firstName: true, lastName: true, principalId: true } },
        },
      });
      const rows = claims.flatMap((c) => {
        const targets = new Set<string>([c.memberId]);
        if (c.member.principalId) targets.add(c.member.principalId);
        const body = `${c.member.firstName} ${c.member.lastName} — claim ${c.claimNumber} has been paid: ${c.currency} ${Number(c.approvedAmount).toLocaleString()}.`;
        return [...targets].map((memberId) => ({
          tenantId,
          memberId,
          type: "PAYMENT_STATUS" as MemberNotificationType,
          priority: "NORMAL" as MemberNotificationPriority,
          title: "Claim paid",
          body,
          href: "/member/utilization",
          metadata: { claimId: c.id, claimNumber: c.claimNumber, event: "PAID" } as Prisma.InputJsonValue,
        }));
      });
      if (rows.length > 0) {
        await prisma.memberNotification.createMany({ data: rows });
      }
    } catch (err) {
      console.error("[member-notification] notifyPaidBatch failed:", err);
    }
  }

  static async getInboxForUser(userId: string, tenantId: string, filter?: { unreadOnly?: boolean }) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const notifications = await prisma.memberNotification.findMany({
      where: {
        tenantId,
        memberId: context.id,
        ...(filter?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unreadCount = notifications.filter((notification) => notification.readAt === null).length;

    return {
      memberId: context.id,
      unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        typeLabel: typeLabel(notification.type),
        priority: notification.priority,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
    };
  }

  static async markReadForUser(userId: string, tenantId: string, notificationId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    await prisma.memberNotification.updateMany({
      where: { id: notificationId, tenantId, memberId: context.id },
      data: { readAt: new Date() },
    });
  }

  static async markAllReadForUser(userId: string, tenantId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    await prisma.memberNotification.updateMany({
      where: { tenantId, memberId: context.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
