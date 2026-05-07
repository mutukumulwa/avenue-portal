"use server";

import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";

function alertIdFromForm(formData: FormData) {
  const alertId = formData.get("alertId");
  if (typeof alertId !== "string" || alertId.length === 0) {
    throw new Error("Missing alert id");
  }
  return alertId;
}

function groupIdFromForm(formData: FormData) {
  const groupId = formData.get("groupId");
  return typeof groupId === "string" && groupId.length > 0 ? groupId : null;
}

function revalidateAnalyticsPaths(groupId?: string | null) {
  revalidatePath("/analytics");
  revalidatePath("/analytics/alerts");
  if (groupId) revalidatePath(`/analytics/schemes/${groupId}`);
}

export async function acknowledgeAnalyticsAlertAction(formData: FormData) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const scope = await getAnalyticsAccessScope(session);
  const alertId = alertIdFromForm(formData);
  const groupId = groupIdFromForm(formData);

  const alert = await AnalyticsService.acknowledgeAlert(
    scope,
    alertId,
    session.user.id,
  );

  await writeAudit({
    userId: session.user.id,
    action: "ANALYTICS_ALERT_ACKNOWLEDGED",
    module: "ANALYTICS",
    description: `Analytics alert ${alertId} acknowledged.`,
    metadata: { alertId, status: alert?.status ?? null },
  });

  revalidateAnalyticsPaths(groupId);
}

export async function resolveAnalyticsAlertAction(formData: FormData) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const scope = await getAnalyticsAccessScope(session);
  const alertId = alertIdFromForm(formData);
  const groupId = groupIdFromForm(formData);
  const note = formData.get("resolutionNote");

  const alert = await AnalyticsService.resolveAlert(
    scope,
    alertId,
    session.user.id,
    typeof note === "string" ? note : undefined,
  );

  await writeAudit({
    userId: session.user.id,
    action: "ANALYTICS_ALERT_RESOLVED",
    module: "ANALYTICS",
    description: `Analytics alert ${alertId} resolved.`,
    metadata: { alertId, status: alert?.status ?? null },
  });

  revalidateAnalyticsPaths(groupId);
}
