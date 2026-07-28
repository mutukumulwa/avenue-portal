import type { DisbursementStatus } from "@prisma/client";

/**
 * PNOS F6.7 — provider disbursement state machine (pure; no I/O, no writer).
 *
 * The legal lifecycle of an actual payment fact (ProviderDisbursement, §7.9),
 * distinct from the voucher/batch that authorize it. The record/confirm service
 * that drives these transitions is F6.8; this module only DEFINES the graph, the
 * maker/checker actor model, and the "counts as paid" predicate used by the I5
 * conservation leg (F6.9). A new enum value force-breaks the Record (compile
 * safety) while `import type` keeps the module free of a runtime @prisma/client
 * dependency, so it is unit-testable with no generated client at runtime.
 *
 * Invariant (§7.9): a FAILED/REVERSED disbursement is TERMINAL — it never silently
 * marks a batch unpaid; a retry is a NEW disbursement (distinct idempotency key),
 * and a reversal is a compensating fact (status REVERSED + reversalOfDisbursementId).
 */

export const DISBURSEMENT_TRANSITIONS: Record<DisbursementStatus, DisbursementStatus[]> = {
  PENDING: ["RELEASED", "FAILED"], // released for payment, or rejected at release
  RELEASED: ["PROCESSING", "FAILED"], // sent to the channel, or could not be sent
  PROCESSING: ["SUCCEEDED", "FAILED"], // channel-confirmed, or channel-rejected
  SUCCEEDED: ["REVERSED"], // a confirmed payment can only later be reversed
  FAILED: [], // terminal — retry = a new disbursement
  REVERSED: [], // terminal — compensating record for a recalled/bounced payment
};

/** Terminal states — no further transition. */
export const DISBURSEMENT_TERMINAL_STATUSES: DisbursementStatus[] = ["FAILED", "REVERSED"];

/**
 * States that count as an actual successful payment for I5's
 * "= sum(successful disbursement amount)" leg. REVERSED does NOT count — a
 * reversed payment is money that came back.
 */
export const DISBURSEMENT_SUCCESS_STATUSES: DisbursementStatus[] = ["SUCCEEDED"];

/**
 * Maker/checker model (step 2). Keyed by the TARGET status; F6.8 binds MAKER/
 * CHECKER to the concrete finance roles and enforces maker ≠ checker by actor id
 * (as markSettlementBatchPaid does). SYSTEM = recorded from a channel/validation
 * outcome rather than a human decision.
 */
export const DISBURSEMENT_TRANSITION_ACTOR: Record<DisbursementStatus, "MAKER" | "CHECKER" | "SYSTEM" | null> = {
  PENDING: null, // initial
  RELEASED: "MAKER", // finance records + releases
  PROCESSING: "MAKER", // dispatched to the channel
  SUCCEEDED: "CHECKER", // confirming the actual payment is a separation-of-duty act
  FAILED: "SYSTEM", // channel/validation failure
  REVERSED: "CHECKER", // reversal is a sensitive checker action
};

export type DisbursementTransitionErrorCode = "INVALID_TRANSITION";

export class DisbursementTransitionError extends Error {
  constructor(
    public code: DisbursementTransitionErrorCode,
    public from: DisbursementStatus,
    public to: DisbursementStatus,
  ) {
    super(`Illegal disbursement transition ${from} → ${to}`);
    this.name = "DisbursementTransitionError";
  }
}

export function isDisbursementTerminal(status: DisbursementStatus): boolean {
  return DISBURSEMENT_TERMINAL_STATUSES.includes(status);
}

export function isSuccessfulDisbursement(status: DisbursementStatus): boolean {
  return DISBURSEMENT_SUCCESS_STATUSES.includes(status);
}

export function canTransitionDisbursement(from: DisbursementStatus, to: DisbursementStatus): boolean {
  return DISBURSEMENT_TRANSITIONS[from].includes(to);
}

export function assertDisbursementTransition(from: DisbursementStatus, to: DisbursementStatus): void {
  if (!canTransitionDisbursement(from, to)) {
    throw new DisbursementTransitionError("INVALID_TRANSITION", from, to);
  }
}
