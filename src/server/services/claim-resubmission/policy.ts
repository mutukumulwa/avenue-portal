/**
 * PNOS F5.9 — pure resubmission policy (no I/O, no server deps).
 *
 * Two decisions a declined claim's resubmission eligibility rests on, computed purely
 * so they can be unit-tested in isolation and reused by F5.10:
 *   1. resolveResubmissionReason — WHETHER the decline reason permits resubmission, and
 *      the SAFE provider-facing reason to show. It sources from the canonical reason
 *      catalog (AdjudicationReasonCode.resubmissionAllowed + providerDescription) and
 *      falls back to the legacy decision reason (Claim.declineReasonCode) via a map that
 *      NEVER echoes internal/fraud text (§9 — an internal fraud reason is never disclosed).
 *   2. resubmissionDeadline — UNTIL WHEN, from the contract submission window, computed in
 *      UTC so a claim on the boundary is not mis-judged by the host timezone.
 */

/** The provider permission that gates filing a linked replacement claim (F1.1). A
 *  post-decline resubmission is a linked replacement claim, so it reuses provider.claim.correct
 *  (there is no dedicated resubmit permission in the catalog — flagged). */
export const RESUBMIT_PERMISSION = "provider.claim.correct";

export interface CatalogReasonRow {
  resubmissionAllowed: boolean;
  providerDescription: string;
}

/**
 * Legacy Claim.declineReasonCode → resubmission policy + SAFE provider text. The safe
 * text NEVER discloses an internal/fraud rationale (a suspected-fraud decline is opaque
 * to the provider: "declined after review — contact the payer").
 */
export const LEGACY_DECLINE_RESUBMISSION: Record<string, { resubmissionAllowed: boolean; safeReason: string }> = {
  INVALID_DOCS: { resubmissionAllowed: true, safeReason: "A required document was missing or not acceptable. Attach the correct documents and resubmit." },
  WAITING_PERIOD: { resubmissionAllowed: false, safeReason: "This service fell within the member's waiting period and is not payable." },
  PREEXISTING: { resubmissionAllowed: false, safeReason: "This service relates to a pre-existing condition that is not covered." },
  EXCLUSION: { resubmissionAllowed: false, safeReason: "This service is excluded under the member's cover." },
  BENEFIT_EXHAUSTED: { resubmissionAllowed: false, safeReason: "The member's benefit for this service has been exhausted." },
  NON_COVERED_FACILITY: { resubmissionAllowed: false, safeReason: "This facility is not covered for the member's scheme for this service." },
  // NEVER discloses the fraud/FWA rationale (§9).
  FRAUD_SUSPECTED: { resubmissionAllowed: false, safeReason: "This claim was declined after review and cannot be resubmitted online — contact the payer to discuss." },
  OTHER: { resubmissionAllowed: false, safeReason: "This claim was declined — contact the payer to discuss whether it can be resubmitted." },
};

const DEFAULT_DECLINE = { resubmissionAllowed: false, safeReason: "This claim was declined — contact the payer to discuss whether it can be resubmitted." };

/**
 * Resolve WHETHER resubmission is permitted + the SAFE reason. Precedence:
 *   1. line-level catalog reasons (every declining reason must permit it);
 *   2. the claim-level decline code resolved against the catalog;
 *   3. the legacy decision reason map.
 * Only ever returns provider-facing text — never internalDescription.
 */
export function resolveResubmissionReason(input: {
  lineReasonRows: CatalogReasonRow[];
  claimReasonRow: CatalogReasonRow | null;
  declineReasonCode: string | null;
}): { resubmissionAllowed: boolean; safeReason: string } {
  if (input.lineReasonRows.length > 0) {
    const resubmissionAllowed = input.lineReasonRows.every((r) => r.resubmissionAllowed);
    const safeReason = [...new Set(input.lineReasonRows.map((r) => r.providerDescription))].join(" ");
    return { resubmissionAllowed, safeReason };
  }
  if (input.claimReasonRow) {
    return { resubmissionAllowed: input.claimReasonRow.resubmissionAllowed, safeReason: input.claimReasonRow.providerDescription };
  }
  const code = (input.declineReasonCode ?? "").trim().toUpperCase();
  return LEGACY_DECLINE_RESUBMISSION[code] ?? DEFAULT_DECLINE;
}

export type WindowBasis = "SERVICE_DATE" | "DISCHARGE_DATE" | "INVOICE_DATE" | "MONTHLY_BATCH" | null;

/**
 * The last instant a resubmission may be filed, from the contract submission window, or
 * null when no window is set (no contractual time limit). Computed in UTC — the deadline
 * DAY is inclusive to its last millisecond, so a claim on the boundary is not mis-judged
 * by the host timezone (spec "boundary timezone").
 */
export function resubmissionDeadline(input: {
  windowDays: number | null;
  basis: WindowBasis;
  dateOfService: Date;
  dischargeDate: Date | null;
}): Date | null {
  if (input.windowDays == null || input.windowDays <= 0) return null;

  let basisDate: Date;
  switch (input.basis) {
    case "DISCHARGE_DATE":
      basisDate = input.dischargeDate ?? input.dateOfService;
      break;
    case "MONTHLY_BATCH": {
      const s = input.dateOfService;
      basisDate = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)); // last day of the service month
      break;
    }
    default: // SERVICE_DATE / INVOICE_DATE (no invoice-date field) / null
      basisDate = input.dateOfService;
  }
  const y = basisDate.getUTCFullYear();
  const m = basisDate.getUTCMonth();
  const d = basisDate.getUTCDate();
  return new Date(Date.UTC(y, m, d + input.windowDays, 23, 59, 59, 999));
}
