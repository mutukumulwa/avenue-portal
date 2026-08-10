/**
 * WP-3.5G — the member lifecycle state machine.
 *
 * A single, prisma-free source of truth for which `MemberStatus` transitions the
 * GENERAL member-edit dropdown may perform, shared by the server (members.service
 * `updateMember`) and the client (`MemberEditForm`) so the UI and the enforcement
 * can never drift. Terminal states (fraud/breach/death termination, cooling-off
 * cancellation, expiry, lapse-before-activation, and plain TERMINATED) are
 * reachable only through the governed lifecycle flows and are NOT reversible via
 * the edit dropdown — reinstatement is a governed flow with its own reason + audit
 * (D9). This module carries no runtime deps so it is safe to import into a client
 * component.
 */

/**
 * Statuses that have ENDED cover. The edit dropdown can never move OUT of one of
 * these (no terminal→active, no terminal→re-termination); a plain profile edit
 * that keeps the same status is still allowed. Mirrors coverage.service's
 * COVERAGE_ENDED_STATUSES (kept as a literal here to stay dependency-free).
 */
export const TERMINAL_MEMBER_STATUSES = [
  "TERMINATED",
  "TERMINATED_FRAUD",
  "TERMINATED_BREACH",
  "TERMINATED_DEATH",
  "CANCELLED_COOLING_OFF",
  "EXPIRED",
  "LAPSED_BEFORE_ACTIVATION",
] as const;

export function isTerminalMemberStatus(status: string): boolean {
  return (TERMINAL_MEMBER_STATUSES as readonly string[]).includes(status);
}

/**
 * The transitions the GENERAL edit `<select>` may perform (each key = current
 * status, value = the statuses it may move TO). Anything not listed — most
 * importantly terminal→ACTIVE (reinstatement) and terminal→terminal
 * (re-termination) — must go through a governed lifecycle flow instead. Staying
 * on the same status (a plain profile edit) is always allowed and handled by
 * {@link canEditTransition}, so it is not repeated here.
 *
 * LAPSED is intentionally NOT allowed to move back to ACTIVE via the dropdown:
 * lapse reinstatement runs through lifecycleService (catch-up window + waiting
 * period preservation), not a free status flip.
 */
export const EDIT_ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING_ACTIVATION: ["ACTIVE", "SUSPENDED", "LAPSED", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "LAPSED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "LAPSED", "TERMINATED"],
  LAPSED: ["TERMINATED"],
};

/** The statuses the edit dropdown may EVER set (the union used to render options). */
export const EDIT_SELECTABLE_STATUSES = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "SUSPENDED",
  "LAPSED",
  "TERMINATED",
] as const;

/**
 * True when the edit dropdown may move `from → to`. Same-status (no change) is
 * always allowed so a terminal member's contact details can still be corrected.
 */
export function canEditTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return (EDIT_ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * The statuses the edit dropdown should OFFER for a member currently in `from`:
 * the current status plus its allowed targets, intersected with the selectable
 * set. A terminal member is offered only its own (locked) status.
 */
export function editStatusOptions(from: string): string[] {
  const targets = new Set<string>([from, ...(EDIT_ALLOWED_TRANSITIONS[from] ?? [])]);
  return EDIT_SELECTABLE_STATUSES.filter((s) => targets.has(s));
}

/**
 * A DISTINCT audit action per lifecycle transition, so the audit trail names the
 * event (MEMBER_SUSPENDED / MEMBER_REINSTATED / …) instead of a generic
 * MEMBER_UPDATED. A pure profile edit (no status change) stays MEMBER_UPDATED.
 */
export function memberTransitionAuditAction(from: string, to: string): string {
  if (from === to) return "MEMBER_UPDATED";
  if (to === "SUSPENDED") return "MEMBER_SUSPENDED";
  if (to === "ACTIVE") return from === "PENDING_ACTIVATION" ? "MEMBER_ACTIVATED" : "MEMBER_REINSTATED";
  if (to === "LAPSED") return "MEMBER_LAPSED";
  if (to === "TERMINATED") return "MEMBER_TERMINATED";
  return "MEMBER_STATUS_CHANGED";
}
