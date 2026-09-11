"use server";

/**
 * F5.10 — provider claim-resubmission server action, on the Family Hospital UAT
 * plan P04.02 capture contract.
 *
 * A thin adapter over the F5.10 `ClaimResubmissionService`, which enforces F5.9
 * eligibility (declined + reason + deadline + not-already-resubmitted), files a
 * FULL new RESUBMISSION through the canonical intake, and advances the chain
 * pointer while leaving the original DECLINED decision immutable. The content
 * is prepared exactly as for a correction (`ProviderClaimCaptureService`):
 * member fixed to the earlier claim, case re-resolved for the resubmission's
 * service date, diagnosis and tariffs re-read, historical lines carried only
 * when unchanged. A stale or ineligible original returns a refresh signal.
 *
 * `"use server"`: async function exports only (AGENTS.md).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mutationFail } from "@/lib/mutation-contract";
import type { ClaimReplacementCaptureSubmission, ReplacementSubmitResult } from "@/lib/provider-capture-contract";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { isProviderAccessError, ProviderAccessService } from "@/server/services/provider-access.service";
import { ClaimResubmissionService, isClaimResubmissionError } from "@/server/services/claim-resubmission/submit.service";
import { RESUBMIT_PERMISSION } from "@/server/services/claim-resubmission/policy";
import { ProviderClaimCaptureService } from "@/server/services/provider-claim-capture.service";
import { replacementCommand, replacementFailure } from "@/server/services/provider-claim-replacement-support";

export async function resubmitProviderClaimAction(input: ClaimReplacementCaptureSubmission): Promise<ReplacementSubmitResult> {
  let access;
  try {
    access = await ProviderAccessService.resolveUserContext();
  } catch (err) {
    if (isProviderAccessError(err)) return mutationFail("FORBIDDEN", { message: "You do not have permission to resubmit claims." });
    throw err;
  }
  const { ctx } = access;
  if (!providerPermits(ctx.permissions, RESUBMIT_PERMISSION)) {
    return mutationFail("FORBIDDEN", { message: "You do not have permission to resubmit claims." });
  }

  const predecessor = await ProviderClaimCaptureService.predecessor(ctx, input?.predecessorClaimId);
  if (!predecessor) return { ...mutationFail("CONFLICT", { message: "This claim is no longer available to resubmit." }), refresh: true };

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
    const res = await ClaimResubmissionService.submit(ctx, command.command);
    claimId = res.claimId;
  } catch (e) {
    return replacementFailure(e, {
      isDomainError: isClaimResubmissionError,
      staleCodes: ["ALREADY_RESUBMITTED", "NOT_DECLINED", "DEADLINE_PASSED", "REASON_NOT_RESUBMITTABLE", "NOT_FOUND", "FORBIDDEN"],
      fallback: "The claim could not be resubmitted.",
    });
  }

  revalidatePath("/provider/claims");
  revalidatePath(`/provider/claims/${predecessor.id}`);
  redirect(`/provider/claims/${claimId}?resubmitted=1`);
}
