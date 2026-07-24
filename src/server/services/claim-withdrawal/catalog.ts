/**
 * PNOS F5.5 — provider claim-withdrawal reason catalog + command/result shapes.
 *
 * A withdrawal is a provider abandoning an UNDECIDED claim (spec §13 F5.5). The
 * reason is a closed catalog code — never free-form clinical text — so the audit
 * trail and outbox stay PHI-free (§9). An optional short note may accompany it.
 * This module is pure (no I/O) so it imports cleanly under any test environment.
 */

/** Closed set of withdrawal reasons. Codes are stable; labels are display-only. */
export const CLAIM_WITHDRAWAL_REASONS = {
  SUBMITTED_IN_ERROR: "Submitted in error",
  DUPLICATE_SUBMISSION: "Duplicate submission",
  MEMBER_NOT_ELIGIBLE: "Member not eligible for this service",
  WRONG_PROVIDER_OR_BRANCH: "Filed at the wrong provider/branch",
  SERVICE_NOT_RENDERED: "Service was not rendered",
  CORRECTION_TO_FOLLOW: "Withdrawing to submit a corrected claim",
  OTHER: "Other",
} as const;

export type ClaimWithdrawalReasonCode = keyof typeof CLAIM_WITHDRAWAL_REASONS;

export function isWithdrawalReasonCode(v: unknown): v is ClaimWithdrawalReasonCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CLAIM_WITHDRAWAL_REASONS, v);
}

/**
 * Normalize a caller-supplied reason to a catalog code (upper-cased, trimmed).
 * Returns null for anything not in the catalog — the caller rejects it, so an
 * unknown/blank reason can never be persisted.
 */
export function normalizeWithdrawalReason(code: unknown): ClaimWithdrawalReasonCode | null {
  if (typeof code !== "string") return null;
  const up = code.trim().toUpperCase();
  return isWithdrawalReasonCode(up) ? up : null;
}

/** The catalog as a list, for building a reason picker (F5.6). */
export function listWithdrawalReasons(): Array<{ code: ClaimWithdrawalReasonCode; label: string }> {
  return (Object.keys(CLAIM_WITHDRAWAL_REASONS) as ClaimWithdrawalReasonCode[]).map((code) => ({
    code,
    label: CLAIM_WITHDRAWAL_REASONS[code],
  }));
}
