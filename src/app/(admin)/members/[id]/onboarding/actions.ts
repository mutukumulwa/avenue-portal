"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { onboardingService } from "@/server/services/onboarding.service";
import { KycDocType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function initiateOnboardingAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.initiateOnboarding(memberId, session.user.tenantId);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function saveKycAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.completeKyc(memberId, session.user.tenantId, {
    govIdType: (formData.get("govIdType") as string) || undefined,
    govIdNumber: (formData.get("govIdNumber") as string) || undefined,
    photoUrl: (formData.get("photoUrl") as string) || undefined,
  }, session.user.id);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function uploadKycDocAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.addKycDocument(
    memberId, session.user.tenantId,
    formData.get("docType") as KycDocType,
    formData.get("fileUrl") as string,
    session.user.id,
  );
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function issueDigitalCardAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.issueDigitalCard(memberId, session.user.tenantId);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function queuePhysicalCardAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  const isSmart = formData.get("isSmart") === "true";
  await onboardingService.queuePhysicalCard(memberId, session.user.tenantId, isSmart);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function updateCardStatusAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  const cardId = formData.get("cardId") as string;
  const newStatus = formData.get("newStatus") as string;
  await onboardingService.updateCardStatus(cardId, session.user.tenantId, newStatus as never, session.user.id);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function sendWelcomeAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.sendWelcomeCommunications(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}/onboarding`);
}

export async function markPortalProvisionedAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const memberId = formData.get("memberId") as string;
  await onboardingService.markPortalProvisioned(memberId, session.user.tenantId, session.user.id);
  revalidatePath(`/members/${memberId}/onboarding`);
}
