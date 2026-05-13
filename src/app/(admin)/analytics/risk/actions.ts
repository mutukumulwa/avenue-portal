"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { AnalyticsService } from "@/server/services/analytics.service";
import { revalidatePath } from "next/cache";

export async function bulkEnrolCareManagementAction(formData: FormData): Promise<void> {
  const session     = await requireRole(ROLES.CLINICAL);
  const programName = formData.get("programName") as string;
  const memberIds   = (formData.get("memberIds") as string ?? "").split(",").filter(Boolean);

  if (!programName) throw new Error("Program name is required");
  if (memberIds.length === 0) throw new Error("No members selected");

  await AnalyticsService.bulkEnrolCareManagement(
    session.user.tenantId, memberIds, programName, session.user.id,
  );

  revalidatePath("/analytics/risk");
}
