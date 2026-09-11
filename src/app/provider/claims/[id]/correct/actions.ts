"use server";

/**
 * F5.8 — provider claim-correction server action, on the Family Hospital UAT
 * plan P04.02 capture contract.
 *
 * Still a thin adapter over the F5.7 canonical `ClaimReplacementService`, which
 * does the real authorization (permission + provider ownership + branch),
 * DERIVES member and provider from the earlier claim, atomically supersedes it,
 * creates the linked child and audits. What changed: the corrected content is no
 * longer taken from the browser as rates and codes. `ProviderClaimCaptureService`
 * re-resolves the case for the earlier claim's member (never the form's), for
 * the correction's service date; re-reads the diagnosis; re-reads every selected
 * tariff; and carries an unchanged historical line exactly as stored. The
 * command then carries the case currency, the server-built line provenance and
 * the resolved branch (used only when the earlier claim has none).
 *
 * `"use server"`: async function exports only (AGENTS.md).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationFail } from "@/lib/mutation-contract";
import type { ClaimReplacementCaptureSubmission, ReplacementSubmitResult } from "@/lib/provider-capture-contract";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { isProviderAccessError, ProviderAccessService } from "@/server/services/provider-access.service";
import { ClaimReplacementService, isClaimReplacementError } from "@/server/services/claim-replacement/service";
import { CORRECT_PERMISSION } from "@/server/services/claim-replacement/policy";
import { ProviderClaimCaptureService } from "@/server/services/provider-claim-capture.service";
import { replacementCommand, replacementFailure } from "@/server/services/provider-claim-replacement-support";

export async function correctProviderClaimAction(input: ClaimReplacementCaptureSubmission): Promise<ReplacementSubmitResult> {
  let access;
  try {
    access = await ProviderAccessService.resolveUserContext();
  } catch (err) {
    if (isProviderAccessError(err)) return mutationFail("FORBIDDEN", { message: "You do not have permission to correct claims." });
    throw err;
  }
  const { ctx } = access;
  if (!providerPermits(ctx.permissions, CORRECT_PERMISSION)) {
    return mutationFail("FORBIDDEN", { message: "You do not have permission to correct claims." });
  }

  const predecessor = await ProviderClaimCaptureService.predecessor(ctx, input?.predecessorClaimId);
  if (!predecessor) return { ...mutationFail("CONFLICT", { message: "This claim is no longer available to correct." }), refresh: true };

  const prep = await ProviderClaimCaptureService.prepare(ctx, input, {
    purpose: "CLAIM_CORRECTION",
    fixed: { memberId: predecessor.memberId, branchId: predecessor.providerBranchId },
    carried: { currency: predecessor.currency, lines: predecessor.lines },
  });
  if (!prep.ok) return prep.failure;

  const command = replacementCommand(ctx, predecessor.id, input, prep.prepared);
  if (!command.ok) return command.failure;

  let claimId: string;
  try {
    const res = await ClaimReplacementService.replace(ctx, command.command);
    claimId = res.claimId;
  } catch (e) {
    return replacementFailure(e, {
      isDomainError: isClaimReplacementError,
      staleCodes: ["NOT_CORRECTABLE", "HAS_FINANCIAL_EFFECT", "NOT_FOUND"],
      fallback: "The claim could not be corrected.",
    });
  }

  // Success ⇒ the child is the new current claim; land on it (banner via ?corrected=1).
  revalidatePath("/provider/claims");
  revalidatePath(`/provider/claims/${predecessor.id}`);
  redirect(`/provider/claims/${claimId}?corrected=1`);
}
