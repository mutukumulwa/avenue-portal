import type { ClaimStatus } from "@prisma/client";

/**
 * F7.1 — THE claim status transition graph. One place encodes what moves are
 * legal; every sanctioned mutation owner (ClaimDecisionService, settlement,
 * guarded disburse, capture/fraud-hold/appeal actions) asserts through here
 * BEFORE writing. This is a guard, not a decision engine — it never decides
 * WHETHER to move, only whether the move is structurally legal, so illegal
 * backward/terminal jumps (PAID→APPROVED, VOID→anything, double-PAID) become
 * impossible even for a future coding mistake inside an owner.
 *
 * Paired with the F5.10 source guard (tests/services/claim-status-mutation-
 * guard.test.ts): new files cannot write Claim.status at all, and the
 * sanctioned owners cannot write an illegal move.
 */
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  INCURRED: ["RECEIVED", "CAPTURED", "VOID"],
  RECEIVED: ["CAPTURED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "DECLINED"],
  CAPTURED: ["UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "DECLINED"],
  UNDER_REVIEW: ["APPROVED", "PARTIALLY_APPROVED", "DECLINED", "CAPTURED"],
  APPROVED: ["PAID", "VOID", "APPEALED"],
  PARTIALLY_APPROVED: ["PAID", "VOID", "APPEALED"],
  DECLINED: ["APPEALED"],
  APPEALED: ["APPEAL_APPROVED", "APPEAL_DECLINED"],
  APPEAL_APPROVED: ["PAID", "VOID"],
  APPEAL_DECLINED: [],
  PAID: [],
  VOID: [],
};

/** Statuses from which an AUTOMATIC decision may execute (D17 eligibility). */
export const AUTO_DECIDABLE_STATUSES: ClaimStatus[] = ["RECEIVED", "CAPTURED", "UNDER_REVIEW"];

export class IllegalClaimTransition extends Error {
  readonly from: ClaimStatus;
  readonly to: ClaimStatus;
  constructor(from: ClaimStatus, to: ClaimStatus, context?: string) {
    super(
      `Illegal claim status transition ${from} → ${to}${context ? ` (${context})` : ""}. ` +
        `Legal moves from ${from}: ${TRANSITIONS[from].length ? TRANSITIONS[from].join(", ") : "none — terminal"}.`,
    );
    this.name = "IllegalClaimTransition";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return true; // idempotent re-assert of the same state is a no-op, never an error
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws `IllegalClaimTransition` when the move is not in the graph. */
export function assertClaimTransition(from: ClaimStatus, to: ClaimStatus, context?: string): void {
  if (!canTransitionClaim(from, to)) throw new IllegalClaimTransition(from, to, context);
}

export function isTerminalClaimStatus(status: ClaimStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
