"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ClaimWithdrawalService, isClaimWithdrawalError } from "@/server/services/claim-withdrawal/service";
import { WITHDRAW_PERMISSION } from "@/server/services/claim-withdrawal/policy";

export interface WithdrawClaimActionResult {
  ok?: boolean;
  /** true ⇒ the claim was already withdrawn — an idempotent replay, still a success. */
  alreadyWithdrawn?: boolean;
  error?: string;
  /** true ⇒ the page is stale (the claim moved under us) — the client should refresh. */
  refresh?: boolean;
}

/**
 * F5.6 — provider claim-withdrawal server action. A thin, ownership-safe adapter over
 * the F5.5 canonical ClaimWithdrawalService, which does the real authorization
 * (permission + provider ownership + branch), the status-guarded transition, and the
 * audit/outbox. This action adds the friendly early permission gate (matching sibling
 * provider actions), maps domain errors to a message, and signals a stale refresh so a
 * claim that was decided/withdrawn concurrently re-renders instead of looking withdrawable.
 */
export async function withdrawProviderClaimAction(
  input: { claimId: string; reasonCode: string; note?: string },
): Promise<WithdrawClaimActionResult> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, WITHDRAW_PERMISSION)) {
    return { error: "You do not have permission to withdraw claims." };
  }

  const claimId = (input.claimId ?? "").trim();
  if (!claimId) return { error: "Missing claim." };

  try {
    const res = await ClaimWithdrawalService.withdraw(ctx, {
      tenantId: ctx.tenantId,
      claimId,
      reasonCode: input.reasonCode,
      note: input.note,
    });
    revalidatePath(`/provider/claims/${claimId}`);
    return { ok: true, alreadyWithdrawn: res.alreadyWithdrawn };
  } catch (e) {
    // A state-mismatch (a decision landed, or the claim moved terminal concurrently)
    // means the page is stale — refresh it so the actor sees the current state.
    const stale = isClaimWithdrawalError(e) && ["NOT_WITHDRAWABLE", "HAS_FINANCIAL_EFFECT", "NOT_FOUND"].includes(e.code);
    if (stale) revalidatePath(`/provider/claims/${claimId}`);
    return { error: (e as Error).message || "The claim could not be withdrawn.", refresh: stale || undefined };
  }
}
