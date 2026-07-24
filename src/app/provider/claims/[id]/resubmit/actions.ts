"use server";

import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ClaimResubmissionService, isClaimResubmissionError } from "@/server/services/claim-resubmission/submit.service";
import { RESUBMIT_PERMISSION } from "@/server/services/claim-resubmission/policy";
import type { CorrectClaimInput } from "../correct/actions";

/**
 * F5.10 — provider claim-resubmission server action. A thin adapter over the F5.10
 * ClaimResubmissionService, which enforces F5.9 eligibility (declined + reason + deadline +
 * not-already-resubmitted), files a FULL new RESUBMISSION through the canonical intake, and
 * advances the chain pointer while leaving the original DECLINED decision immutable. Reuses
 * the F5.7/F5.8 replacement full-form input; member/provider/branch are never passed (the
 * service derives them). On a stale/ineligible original, surfaces the safe reason + a refresh.
 */
export async function resubmitProviderClaimAction(
  input: CorrectClaimInput,
): Promise<{ error?: string; refresh?: boolean } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, RESUBMIT_PERMISSION)) {
    return { error: "You do not have permission to resubmit claims." };
  }

  const predecessorClaimId = (input.predecessorClaimId ?? "").trim();
  if (!predecessorClaimId) return { error: "Missing claim." };
  if (!input.primaryDiagnosis?.code) return { error: "Add a primary diagnosis." };
  const lines = (input.lineItems ?? []).filter((l) => l.description?.trim() && Number(l.unitCost) > 0);
  if (lines.length === 0) return { error: "Add at least one service line with an amount." };

  let claimId: string;
  try {
    const res = await ClaimResubmissionService.submit(ctx, {
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
    const stale = isClaimResubmissionError(e) && ["ALREADY_RESUBMITTED", "NOT_DECLINED", "DEADLINE_PASSED", "REASON_NOT_RESUBMITTABLE", "NOT_FOUND"].includes(e.code);
    return { error: (e as Error).message || "The claim could not be resubmitted.", refresh: stale || undefined };
  }

  redirect(`/provider/claims/${claimId}?resubmitted=1`);
}
