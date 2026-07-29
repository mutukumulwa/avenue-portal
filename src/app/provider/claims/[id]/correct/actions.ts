"use server";

import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ClaimReplacementService, isClaimReplacementError } from "@/server/services/claim-replacement/service";
import { CORRECT_PERMISSION } from "@/server/services/claim-replacement/policy";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export interface CorrectClaimInput {
  predecessorClaimId: string;
  idempotencyKey: string; // the form's draft UUID — replays across retry/refresh
  reason?: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  attendingDoctor?: string;
  primaryDiagnosis: { code: string; description: string };
  lineItems: { serviceCategory: ClaimLineCategory; cptCode: string; description: string; quantity: number; unitCost: number }[];
}

/**
 * F5.8 — provider claim-correction server action. A thin adapter over the F5.7 canonical
 * ClaimReplacementService, which does the real authorization (permission + provider
 * ownership + branch), DERIVES member/provider/branch from the predecessor (they can NEVER
 * be altered by this form — the input carries only correctable content), atomically
 * supersedes the predecessor and creates the linked child, and audits. This action adds the
 * friendly early permission gate, maps domain errors, and (for a stale/decided predecessor)
 * signals a refresh so the correct page re-evaluates instead of retrying blindly.
 */
export async function correctProviderClaimAction(
  input: CorrectClaimInput,
): Promise<{ error?: string; refresh?: boolean } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, CORRECT_PERMISSION)) {
    return { error: "You do not have permission to correct claims." };
  }

  const predecessorClaimId = (input.predecessorClaimId ?? "").trim();
  if (!predecessorClaimId) return { error: "Missing claim." };
  if (!input.primaryDiagnosis?.code) return { error: "Add a primary diagnosis." };
  const lines = (input.lineItems ?? []).filter((l) => l.description?.trim() && Number(l.unitCost) > 0);
  if (lines.length === 0) return { error: "Add at least one service line with an amount." };

  let claimId: string;
  try {
    const res = await ClaimReplacementService.replace(ctx, {
      tenantId: ctx.tenantId,
      predecessorClaimId,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      serviceType: input.serviceType,
      benefitCategory: input.benefitCategory,
      dateOfService: input.dateOfService,
      attendingDoctor: input.attendingDoctor,
      diagnoses: [{ code: input.primaryDiagnosis.code, description: input.primaryDiagnosis.description, standardCharge: null, isPrimary: true }],
      lineItems: lines.map((l) => {
        const qty = Math.max(1, Number(l.quantity) || 1);
        const unit = Number(l.unitCost) || 0;
        return { serviceCategory: l.serviceCategory, cptCode: l.cptCode ?? "", description: l.description, icdCode: input.primaryDiagnosis.code, quantity: qty, unitCost: unit, billedAmount: qty * unit };
      }),
    });
    claimId = res.claimId;
  } catch (e) {
    const stale = isClaimReplacementError(e) && ["NOT_CORRECTABLE", "HAS_FINANCIAL_EFFECT", "NOT_FOUND"].includes(e.code);
    return { error: (e as Error).message || "The claim could not be corrected.", refresh: stale || undefined };
  }

  // Success ⇒ the child is the new current claim; land on it (banner via ?corrected=1).
  redirect(`/provider/claims/${claimId}?corrected=1`);
}
