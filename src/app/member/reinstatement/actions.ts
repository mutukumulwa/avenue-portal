"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { ReinstatementService } from "@/server/services/reinstatement.service";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function requestReinstatementAction(_prev: unknown, _fd: FormData) {
  const session = await requireRole(ROLES.MEMBER);

  const member = await prisma.member.findFirst({
    where: { user: { id: session.user.id }, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!member) return { error: "Member profile not found" };

  try {
    await ReinstatementService.requestReinstatement(session.user.tenantId, member.id);
    revalidatePath("/member/reinstatement");
    revalidatePath("/member/dashboard");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}
