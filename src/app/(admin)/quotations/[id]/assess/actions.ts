"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { intakeService } from "@/server/services/intake.service";
import { LifeRole, Gender, UWDecisionType } from "@prisma/client";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ── Add a single life manually ─────────────────────────────────────────────
export async function addLifeAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const tenantId = session.user.tenantId;

  const icd10Raw = formData.get("icd10Codes") as string | null;
  const medicalHistory = icd10Raw
    ? icd10Raw.split(",").map((c) => ({ icd10Code: c.trim(), description: "", isCurrentCondition: true }))
    : [];

  await intakeService.addLives(quotationId, tenantId, [{
    role: (formData.get("role") as LifeRole) || LifeRole.PRINCIPAL,
    principalLifeId: (formData.get("principalLifeId") as string) || undefined,
    firstName: formData.get("firstName") as string,
    lastName:  formData.get("lastName") as string,
    nationalId: (formData.get("nationalId") as string) || undefined,
    dateOfBirth: new Date(formData.get("dateOfBirth") as string),
    gender: formData.get("gender") as Gender,
    medicalHistory,
  }]);

  revalidatePath(`/quotations/${quotationId}/assess`);
}

// ── Submit for validation ──────────────────────────────────────────────────
export async function submitForValidationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const tenantId = session.user.tenantId;

  const result = await intakeService.submitForValidation(quotationId, tenantId, session.user.id);
  if (!result.passed) {
    // Return to the page — the errors will show via revalidation
    revalidatePath(`/quotations/${quotationId}/assess`);
    return;
  }

  // Assemble risk profile now that validation passed
  await intakeService.assembleRiskProfile(quotationId, tenantId);
  revalidatePath(`/quotations/${quotationId}/assess`);
}

// ── Record a per-life underwriting decision ────────────────────────────────
export async function recordDecisionAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const quotationId = formData.get("quotationId") as string;

  await intakeService.recordDecision(tenantId, session.user.id, {
    quotationId,
    quotationLifeId: formData.get("quotationLifeId") as string,
    decision: formData.get("decision") as UWDecisionType,
    loadingMultiplier: formData.get("loadingMultiplier") ? Number(formData.get("loadingMultiplier")) : undefined,
    excludedIcd10Codes: (formData.get("excludedIcd10Codes") as string | null)
      ?.split(",").map((c) => c.trim()).filter(Boolean),
    waitingPeriodDays: formData.get("waitingPeriodDays") ? Number(formData.get("waitingPeriodDays")) : undefined,
    waitingPeriodCategories: (formData.get("waitingPeriodCategories") as string | null)
      ?.split(",").map((c) => c.trim()).filter(Boolean),
    reasonCode: formData.get("reasonCode") as string,
    narrative: (formData.get("narrative") as string) || undefined,
  });

  revalidatePath(`/quotations/${quotationId}/assess`);
}

// ── Submit for pricing (post-assessment) ──────────────────────────────────
export async function submitForPricingAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const tenantId = session.user.tenantId;

  await intakeService.submitForPricing(quotationId, tenantId, session.user.id, {
    projectedGrossKes: formData.get("projectedGrossKes") ? Number(formData.get("projectedGrossKes")) : undefined,
    schemeDiscountPct: formData.get("schemeDiscountPct") ? Number(formData.get("schemeDiscountPct")) / 100 : undefined,
  });

  redirect(`/quotations/${quotationId}`);
}

// ── Senior approval ────────────────────────────────────────────────────────
export async function approveSeniorAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const note = formData.get("note") as string;

  await intakeService.approveSeniorAssessment(quotationId, session.user.tenantId, session.user.id, note);
  redirect(`/quotations/${quotationId}`);
}

// ── Decline ────────────────────────────────────────────────────────────────
export async function declineAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const reason = formData.get("reason") as string;

  await intakeService.decline(quotationId, session.user.tenantId, session.user.id, reason);
  redirect(`/quotations`);
}

// ── Return to submitter ────────────────────────────────────────────────────
export async function returnToSubmitterAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const reason = formData.get("reason") as string;

  await intakeService.returnToSubmitter(quotationId, session.user.tenantId, session.user.id, reason);
  revalidatePath(`/quotations/${quotationId}/assess`);
}
