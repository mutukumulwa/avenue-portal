import "server-only";

/**
 * Family Hospital UAT plan P04.02 — what the correction (F5.8) and resubmission
 * (F5.10) actions share: the replacement command built from a prepared capture,
 * and the mapping of the replacement services' errors onto form outcomes.
 */
import { mutationFail } from "@/lib/mutation-contract";
import type { ClaimReplacementCaptureSubmission, ReplacementSubmitResult } from "@/lib/provider-capture-contract";
import type { ReplaceClaimCommand } from "./claim-replacement/submission";
import { isProviderAccessError, type ProviderAccessContext } from "./provider-access.service";
import { ProviderClaimCaptureService, type PreparedClaimCapture } from "./provider-claim-capture.service";

const HTML_RE = /<\s*[a-zA-Z/!]/;

/**
 * The full replacement content, from the server's prepared capture only. The
 * member and provider are NOT here — the services take them from the earlier
 * claim. The branch is the one this case was resolved at; the services use it
 * only when the earlier claim has none (a replacement never changes a branch).
 */
export function replacementCommand(
  ctx: ProviderAccessContext,
  predecessorClaimId: string,
  input: Pick<ClaimReplacementCaptureSubmission, "idempotencyKey" | "reason">,
  p: PreparedClaimCapture,
): { ok: true; command: ReplaceClaimCommand } | { ok: false; failure: NonNullable<ReplacementSubmitResult> } {
  let reason: string | undefined;
  if (input.reason !== undefined && input.reason !== null) {
    const text = typeof input.reason === "string" ? input.reason.trim().replace(/\s+/g, " ") : null;
    if (text === null || text.length > 280 || HTML_RE.test(text)) {
      return { ok: false, failure: mutationFail("VALIDATION", { message: "The reason must be plain text of up to 280 characters.", fieldErrors: { reason: ["Use plain text of up to 280 characters."] } }) };
    }
    reason = text || undefined;
  }
  return {
    ok: true,
    command: {
      tenantId: ctx.tenantId,
      predecessorClaimId,
      idempotencyKey: input.idempotencyKey,
      reason,
      serviceType: p.serviceType,
      benefitCategory: p.trusted.benefitCategory,
      dateOfService: p.trusted.serviceDateIso,
      attendingDoctor: p.attendingDoctor,
      diagnoses: [{ code: p.diagnosis.code, description: p.diagnosis.description, standardCharge: null, isPrimary: true }],
      lineItems: ProviderClaimCaptureService.intakeLines(p),
      ...(p.trusted.currency ? { currency: p.trusted.currency } : {}),
      lineProvenance: ProviderClaimCaptureService.lineProvenance(p),
      providerBranchId: p.trusted.branchId,
    },
  };
}

/**
 * The replacement services throw typed domain errors with safe messages. A
 * stale earlier claim (decided, replaced, past its window) refreshes the page;
 * anything unrecognised may have been committed or not, so it is reported as an
 * unknown outcome — never with the raw error text, never inviting a blind retry.
 */
export function replacementFailure(
  e: unknown,
  opts: { isDomainError: (e: unknown) => boolean; staleCodes: readonly string[]; fallback: string },
): NonNullable<ReplacementSubmitResult> {
  if (isProviderAccessError(e)) return mutationFail("FORBIDDEN", { message: "You do not have permission to do this for this claim." });
  if (opts.isDomainError(e)) {
    const { code, message } = e as { code: string; message: string };
    if (code === "IDEMPOTENCY_CONFLICT") return mutationFail("CONFLICT", { message });
    if (opts.staleCodes.includes(code)) return { ...mutationFail("CONFLICT", { message }), refresh: true };
    return mutationFail("VALIDATION", { message: message || opts.fallback });
  }
  return mutationFail("UNKNOWN_OUTCOME", {
    message: `${opts.fallback} We could not confirm whether it was filed — open the claim to check before trying again.`,
  });
}
