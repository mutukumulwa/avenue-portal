import Decimal from "decimal.js";
import { ClaimStatus, type ClaimLineCategory } from "@prisma/client";

/**
 * PNOS F5.11 — pure reconsideration policy (no I/O, no server deps).
 *
 * A reconsideration is a governed case challenging a DECIDED claim/line (D13). This module
 * owns the schema-adjacent rules the F5.12+ service will enforce: the filing-reason catalog +
 * reason eligibility (by decision/line/category), the deadline resolution order, the exact
 * requested/awarded decimal invariants, the safe-vs-internal separation (the provider
 * projection), and the structural consistency checks (line-belongs-to-claim, provider/currency).
 * F5.11 stops at schema + policy — no service.
 */

// ── Filing-reason catalog + eligibility (steps 2, 5) ──────────────────────────

export interface ReconsiderationReason {
  code: string;
  label: string;
  /** Provider-facing description — SAFE (never internal rationale). */
  providerDescription: string;
  /** Decided claim states this reason may be filed against. */
  eligibleDecisions: ClaimStatus[];
  /** Optional line-category restriction (undefined ⇒ any category). */
  eligibleCategories?: ClaimLineCategory[];
}

/** A reconsideration challenges a DECIDED claim — never a pre-decision or non-decision state. */
export const RECONSIDERABLE_CLAIM_STATUSES: ClaimStatus[] = [
  ClaimStatus.DECLINED,
  ClaimStatus.PARTIALLY_APPROVED,
  ClaimStatus.APPROVED,
  ClaimStatus.PAID,
];

export const RECONSIDERATION_REASON_CATALOG: ReconsiderationReason[] = [
  { code: "INCORRECT_DECLINE", label: "Incorrectly declined", providerDescription: "The claim or line was declined but is payable under the member's cover.", eligibleDecisions: [ClaimStatus.DECLINED] },
  { code: "BENEFIT_AVAILABLE", label: "Benefit was available", providerDescription: "Benefit was available for this service but was not applied.", eligibleDecisions: [ClaimStatus.DECLINED, ClaimStatus.PARTIALLY_APPROVED] },
  { code: "UNDERPAID_RATE", label: "Paid below the agreed rate", providerDescription: "The allowed amount is below the contracted rate for this service.", eligibleDecisions: [ClaimStatus.PARTIALLY_APPROVED, ClaimStatus.APPROVED, ClaimStatus.PAID] },
  { code: "PREAUTH_HELD", label: "Valid pre-authorisation held", providerDescription: "A valid pre-authorisation covered this service.", eligibleDecisions: [ClaimStatus.DECLINED, ClaimStatus.PARTIALLY_APPROVED] },
  { code: "CODING_CORRECTION", label: "Coding correction", providerDescription: "A coding correction changes how this line should be adjudicated.", eligibleDecisions: [ClaimStatus.DECLINED, ClaimStatus.PARTIALLY_APPROVED] },
  { code: "EXCLUSION_DISPUTED", label: "Exclusion disputed", providerDescription: "The exclusion applied does not apply to this service.", eligibleDecisions: [ClaimStatus.DECLINED] },
  { code: "OTHER", label: "Other", providerDescription: "Another reason to reconsider this decision.", eligibleDecisions: RECONSIDERABLE_CLAIM_STATUSES },
];

const REASON_BY_CODE = new Map(RECONSIDERATION_REASON_CATALOG.map((r) => [r.code, r]));

export function findReconsiderationReason(code: string): ReconsiderationReason | null {
  return REASON_BY_CODE.get(code) ?? null;
}

/** The filing reasons eligible for a given decided claim status — for the F5.13 picker. */
export function reconsiderationReasonsFor(claimStatus: ClaimStatus): Array<{ code: string; label: string; providerDescription: string }> {
  return RECONSIDERATION_REASON_CATALOG
    .filter((r) => r.eligibleDecisions.includes(claimStatus))
    .map((r) => ({ code: r.code, label: r.label, providerDescription: r.providerDescription }));
}

/** Reason eligibility by decision (and optional line category). */
export function isReconsiderationReasonEligible(code: string, claimStatus: ClaimStatus, lineCategory?: ClaimLineCategory): boolean {
  const reason = REASON_BY_CODE.get(code);
  if (!reason) return false;
  if (!reason.eligibleDecisions.includes(claimStatus)) return false;
  if (reason.eligibleCategories && lineCategory && !reason.eligibleCategories.includes(lineCategory)) return false;
  return true;
}

// ── Deadline resolution order (step 3) ────────────────────────────────────────

/** Platform default reconsideration filing window (days from the decision) when neither
 *  the contract nor the client sets one. */
export const DEFAULT_RECONSIDERATION_WINDOW_DAYS = 60;

/**
 * The last instant a reconsideration may be filed, counted from the DECISION date. Resolution
 * ORDER: contract window → client window → platform default. Computed in UTC with the deadline
 * DAY inclusive (timezone-safe), so a filing on the boundary is not mis-judged by the host tz.
 */
export function resolveReconsiderationDeadline(input: {
  decidedAt: Date;
  contractWindowDays?: number | null;
  clientWindowDays?: number | null;
  defaultWindowDays?: number;
}): Date {
  const days =
    input.contractWindowDays ??
    input.clientWindowDays ??
    input.defaultWindowDays ??
    DEFAULT_RECONSIDERATION_WINDOW_DAYS;
  const d = input.decidedAt;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 23, 59, 59, 999));
}

// ── Requested / awarded decimal invariants (step 4) ───────────────────────────

type Num = number | string | Decimal;

/**
 * The hard ceiling for a line's incremental award — corrected full entitlement LESS all prior
 * approved/paid amounts (§8.8), never negative. A zero ceiling means no supplemental award is
 * possible (§7.8: zero/negative outcomes create no supplemental financial claim).
 */
export function reconsiderationMaxIncrement(input: { correctedEntitlement: Num; alreadyApproved: Num; alreadyPaid: Num }): Decimal {
  const prior = Decimal.max(new Decimal(input.alreadyApproved), new Decimal(input.alreadyPaid));
  const max = new Decimal(input.correctedEntitlement).minus(prior);
  return max.isNeg() ? new Decimal(0) : max;
}

/** An awarded incremental amount must be ≥ 0 and ≤ the maximum positive increment. */
export function validateAwardedIncrement(input: { awarded: Num; max: Num }): { ok: boolean; error?: string } {
  const awarded = new Decimal(input.awarded);
  const max = new Decimal(input.max);
  if (awarded.isNeg()) return { ok: false, error: "Awarded increment cannot be negative." };
  if (awarded.gt(max)) return { ok: false, error: "Awarded increment cannot exceed the maximum positive increment." };
  return { ok: true };
}

/** The supplemental claim ceiling = the sum of awarded line deltas (§7.8). */
export function sumAwardedIncrements(awards: Num[]): Decimal {
  return awards.reduce<Decimal>((s, a) => s.plus(new Decimal(a)), new Decimal(0));
}

// ── Structural consistency (tests: line-belongs-to-claim, provider/currency) ──

/** The disputed claim line must belong to the reconsideration's claim. */
export function lineBelongsToClaim(lineParentClaimId: string, reconsiderationClaimId: string): boolean {
  return lineParentClaimId === reconsiderationClaimId;
}

/** The reconsideration's provider + currency must match the disputed claim's. */
export function providerAndCurrencyConsistent(input: {
  reconsiderationProviderId: string;
  claimProviderId: string;
  reconsiderationCurrency: string;
  claimCurrency: string;
}): { ok: boolean; error?: string } {
  if (input.reconsiderationProviderId !== input.claimProviderId) {
    return { ok: false, error: "Reconsideration provider must match the claim provider." };
  }
  if (input.reconsiderationCurrency !== input.claimCurrency) {
    return { ok: false, error: "Reconsideration currency must match the claim currency." };
  }
  return { ok: true };
}

// ── Safe vs internal separation — the provider projection (step 5) ────────────

/** The provider-facing view of a reconsideration. Internal fields (the original adjudicator,
 *  internal outcome notes, the assigned reviewer/team, internal refs) are NEVER included. */
export interface ProviderReconsiderationView {
  id: string;
  status: string;
  reasonCode: string;
  providerNarrative: string;
  requestedAmount: unknown;
  currency: string;
  filingDeadline: Date | null;
  filedAt: Date | null;
  dueAt: Date | null;
  outcomeReasonCode: string | null;
  outcomeSafeExplanation: string | null;
}

/** Explicit allow-list projection — anything not named here (originalAdjudicatorId,
 *  outcomeInternalNotes, assignedReviewerId, assignedTeam, internal refs) is dropped. */
export function toProviderReconsiderationProjection(r: {
  id: string;
  status: string;
  reasonCode: string;
  providerNarrative: string;
  requestedAmount: unknown;
  currency: string;
  filingDeadline: Date | null;
  filedAt: Date | null;
  dueAt: Date | null;
  outcomeReasonCode: string | null;
  outcomeSafeExplanation: string | null;
}): ProviderReconsiderationView {
  return {
    id: r.id,
    status: r.status,
    reasonCode: r.reasonCode,
    providerNarrative: r.providerNarrative,
    requestedAmount: r.requestedAmount,
    currency: r.currency,
    filingDeadline: r.filingDeadline,
    filedAt: r.filedAt,
    dueAt: r.dueAt,
    outcomeReasonCode: r.outcomeReasonCode,
    outcomeSafeExplanation: r.outcomeSafeExplanation,
  };
}

// ── Provider-visible event timeline (F5.14 — "provider sees only shared state") ─

/**
 * Event types a provider may see in the reconsideration timeline. The internal reviewer
 * workflow (TRIAGED, ASSIGNED, UNDER_REVIEW, INTERNAL_NOTE) is NEVER shown — a provider sees
 * only its own submission, the structured info exchange, and the final outcome.
 */
export const PROVIDER_VISIBLE_RECONSIDERATION_EVENTS: ReadonlySet<string> = new Set([
  "SUBMITTED",
  "INFO_REQUESTED",
  "PROVIDER_RESPONDED",
  "OUTCOME_RECORDED",
  "ACCEPTED",
  "PARTIALLY_ACCEPTED",
  "UPHELD",
  "WITHDRAWN",
  "CLOSED",
]);

/** Only the structured info exchange carries provider-facing message text; every other event
 *  type's message is withheld even if present (defence-in-depth against an internal note leaking
 *  through a shared field). */
const MESSAGE_VISIBLE_RECONSIDERATION_EVENTS: ReadonlySet<string> = new Set(["INFO_REQUESTED", "PROVIDER_RESPONDED"]);

export interface ProviderReconsiderationTimelineEntry {
  at: Date;
  type: string;
  /** Present only for the info-request / provider-response exchange; safe text otherwise null. */
  message: string | null;
}

/**
 * Project a case's events to the provider-safe timeline. Two independent allow-lists gate it:
 * internal workflow events are dropped entirely, and message text is surfaced ONLY for the safe
 * exchange types. The internal fields (internalReasonRef, actorId, metadata, sequence) are never
 * carried — anything not named here cannot reach the provider by construction.
 */
export function toProviderReconsiderationTimeline(
  events: Array<{ eventType: string; message: string | null; createdAt: Date }>,
): ProviderReconsiderationTimelineEntry[] {
  return events
    .filter((e) => PROVIDER_VISIBLE_RECONSIDERATION_EVENTS.has(e.eventType))
    .map((e) => ({
      at: e.createdAt,
      type: e.eventType,
      message: MESSAGE_VISIBLE_RECONSIDERATION_EVENTS.has(e.eventType) ? e.message : null,
    }));
}
