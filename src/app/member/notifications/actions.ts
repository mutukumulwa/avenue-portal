"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { revalidatePath } from "next/cache";

export async function markMemberNotificationReadAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  await MemberNotificationService.markReadForUser(
    session.user.id,
    session.user.tenantId,
    formData.get("notificationId") as string,
  );
  revalidatePath("/member/notifications");
  revalidatePath("/member/dashboard");
}

export async function markAllMemberNotificationsReadAction() {
  const session = await requireRole(ROLES.MEMBER);
  await MemberNotificationService.markAllReadForUser(session.user.id, session.user.tenantId);
  revalidatePath("/member/notifications");
  revalidatePath("/member/dashboard");
}
