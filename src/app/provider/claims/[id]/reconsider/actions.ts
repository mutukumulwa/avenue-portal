"use server";

import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ClaimReconsiderationService, isReconsiderationSubmitError } from "@/server/services/claim-reconsideration/submit.service";

export interface ReconsiderClaimInput {
  claimId: string;
  idempotencyKey: string;
  reasonCode: string;
  providerNarrative: string;
  /** The total additional amount requested (> 0). */
  requestedAmount: number;
  lines: Array<{ claimLineId: string; requestedAllowed?: number }>;
}

/**
 * F5.13 — provider reconsideration submit action. A thin adapter over the F5.12
 * ClaimReconsiderationService.submit, which re-checks eligibility server-side (so a form
 * built against stale eligibility is refused) and creates the governed case WITHOUT touching
 * the claim (D13). The command carries only the claim id + selected lines + the ask — the
 * service scopes the claim to the provider and freezes the original facts itself.
 */
export async function reconsiderProviderClaimAction(
  input: ReconsiderClaimInput,
): Promise<{ error?: string; refresh?: boolean } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.claim.reconsider")) {
    return { error: "You do not have permission to file reconsiderations." };
  }

  const claimId = (input.claimId ?? "").trim();
  if (!claimId) return { error: "Missing claim." };
  if (!input.reasonCode) return { error: "Choose a reason for the reconsideration." };
  if (!(input.requestedAmount > 0)) return { error: "The requested amount must be greater than the original." };
  if (!input.lines?.length) return { error: "Select at least one line to reconsider." };

  try {
    await ClaimReconsiderationService.submit(ctx, {
      tenantId: ctx.tenantId,
      claimId,
      idempotencyKey: input.idempotencyKey,
      reasonCode: input.reasonCode,
      providerNarrative: input.providerNarrative,
      requestedAmount: input.requestedAmount,
      lines: input.lines.map((l) => ({ claimLineId: l.claimLineId, requestedAllowed: l.requestedAllowed })),
    });
  } catch (e) {
    // A stale gate (the window closed, or a reconsideration is now active) — refresh the page.
    const stale = isReconsiderationSubmitError(e) && ["ALREADY_ACTIVE", "DEADLINE_PASSED", "NOT_RECONSIDERABLE", "NOT_FOUND"].includes(e.code);
    return { error: (e as Error).message || "The reconsideration could not be submitted.", refresh: stale || undefined };
  }

  redirect(`/provider/claims/${claimId}?reconsidered=1`);
}
