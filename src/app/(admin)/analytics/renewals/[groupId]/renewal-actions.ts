"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { renewalService } from "@/server/services/renewal.service";
import { revalidatePath } from "next/cache";

export async function computeIntelligenceAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const groupId = formData.get("groupId") as string;
  await renewalService.computeRenewalIntelligence(groupId, session.user.tenantId);
  revalidatePath(`/analytics/renewals/${groupId}`);
}

export async function saveScenarioAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const groupId          = formData.get("groupId") as string;
  const renewalAnalysisId = formData.get("renewalAnalysisId") as string;
  const scenarioName     = formData.get("scenarioName") as string;
  const proposedRateAdj  = Number(formData.get("proposedRateAdj")) / 100; // form sends %, store as decimal
  const proposedCoContrib = formData.get("proposedCoContribAdj") ? Number(formData.get("proposedCoContribAdj")) / 100 : undefined;

  await renewalService.createScenario(renewalAnalysisId, session.user.tenantId, session.user.id, {
    scenarioName: scenarioName || `Scenario ${new Date().toLocaleDateString("en-UG")}`,
    proposedRateAdj,
    proposedCoContribAdj: proposedCoContrib,
  });
  revalidatePath(`/analytics/renewals/${groupId}`);
}

export async function commitScenarioAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const groupId    = formData.get("groupId") as string;
  const scenarioId = formData.get("scenarioId") as string;
  await renewalService.commitScenario(scenarioId, session.user.tenantId, session.user.id);
  revalidatePath(`/analytics/renewals/${groupId}`);
}

export async function dispatchNoticeAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const groupId = formData.get("groupId") as string;
  await renewalService.dispatchRenewalNotice(groupId, session.user.tenantId);
  revalidatePath(`/analytics/renewals/${groupId}`);
}
