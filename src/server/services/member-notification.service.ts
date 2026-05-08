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
