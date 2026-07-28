"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { ProviderImprovementPlanService } from "@/server/services/provider-improvement-plan/service";
import { NETWORK_ANALYTICS_PERMISSION } from "@/server/services/provider-performance/network.service";

/**
 * PNOS F8.6 — the network workspace's only mutation is opening a HUMAN improvement
 * plan (F7.7). It never mutates a rate, tier, or provider status. Gated on the
 * explicit network-analytics permission (beyond the operator role).
 */
export async function createImprovementPlanFromWorkspaceAction(input: { providerId: string; title: string; objective: string; targetDate: string; baselineMetricRef?: string }): Promise<{ ok?: true; error?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  if (!(session.user.permissions ?? []).includes(NETWORK_ANALYTICS_PERMISSION)) return { error: "You need the network-analytics permission." };
  if (!input.title?.trim() || !input.objective?.trim() || !input.targetDate) return { error: "Title, objective, and a target date are required." };
  const target = new Date(input.targetDate);
  if (Number.isNaN(target.getTime())) return { error: "Invalid target date." };
  try {
    await ProviderImprovementPlanService.create(
      { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string },
      { providerId: input.providerId, title: input.title, objective: input.objective, baselineMetricRef: input.baselineMetricRef, targetDate: target },
    );
  } catch (e) {
    return { error: (e as Error).message || "The improvement plan could not be created." };
  }
  revalidatePath("/network-performance");
  return { ok: true };
}
