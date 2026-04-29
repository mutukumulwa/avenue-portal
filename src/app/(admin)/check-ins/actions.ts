"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";

export async function initiateCheckInAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = String(formData.get("memberId") ?? "");
  const providerId = String(formData.get("providerId") ?? "");
  const workstationId = String(formData.get("workstationId") ?? "");

  if (!memberId || !providerId) throw new Error("Member and facility are required.");

  const challenge = await SecureCheckInService.initiateChallenge({
    tenantId: session.user.tenantId,
    memberId,
    providerId,
    initiatedById: session.user.id,
    workstationId: workstationId || null,
  });

  redirect(`/check-ins/${challenge.id}`);
}

export async function confirmVisitCodeAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const challengeId = String(formData.get("challengeId") ?? "");
  const code = String(formData.get("code") ?? "");

  if (!challengeId || !code) throw new Error("Challenge and visit code are required.");

  await SecureCheckInService.confirmVisitCode({
    tenantId: session.user.tenantId,
    challengeId,
    confirmedById: session.user.id,
    code,
  });

  revalidatePath(`/check-ins/${challengeId}`);
}

export async function emergencyOverrideAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = String(formData.get("memberId") ?? "");
  const providerId = String(formData.get("providerId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!memberId || !providerId || !reason) throw new Error("Member, facility, and reason are required.");

  const visit = await SecureCheckInService.emergencyOverride({
    tenantId: session.user.tenantId,
    memberId,
    providerId,
    overrideById: session.user.id,
    reason,
  });

  redirect(`/check-ins/visit/${visit.id}`);
}

export async function knowledgeFallbackAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const challengeId = String(formData.get("challengeId") ?? "");
  const photoEvidenceUrl = String(formData.get("photoEvidenceUrl") ?? "");

  if (!challengeId) throw new Error("Challenge is required.");

  const answers = [0, 1, 2].map((index) => ({
    key: String(formData.get(`knowledgeKey${index}`) ?? ""),
    answer: String(formData.get(`knowledgeAnswer${index}`) ?? ""),
  })).filter((answer) => answer.key && answer.answer);

  if (answers.length < 3) throw new Error("All three knowledge answers are required.");

  const visit = await SecureCheckInService.completeKnowledgeFallback({
    tenantId: session.user.tenantId,
    challengeId,
    confirmedById: session.user.id,
    photoEvidenceUrl: photoEvidenceUrl || null,
    answers,
  });

  redirect(`/check-ins/visit/${visit.id}`);
}

export async function restartCheckInAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const challengeId = String(formData.get("challengeId") ?? "");
  if (!challengeId) throw new Error("Challenge is required.");

  const challenge = await SecureCheckInService.restartChallenge({
    tenantId: session.user.tenantId,
    challengeId,
    initiatedById: session.user.id,
  });

  redirect(`/check-ins/${challenge.id}`);
}

export async function cancelCheckInAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const challengeId = String(formData.get("challengeId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!challengeId) throw new Error("Challenge is required.");

  await SecureCheckInService.cancelChallenge({
    tenantId: session.user.tenantId,
    challengeId,
    cancelledById: session.user.id,
    reason: reason || null,
  });

  revalidatePath(`/check-ins/${challengeId}`);
}
