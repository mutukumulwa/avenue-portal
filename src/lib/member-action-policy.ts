/**
 * UAT-HF P07.06 — what a member's status allows (DEF-058).
 *
 * DEF-058 (S2): "On a FRESHLY loaded profile (not a stale tab) of a member whose
 * status chip reads LAPSED, the page still displayed 'ANNUAL LIMIT (UGX)
 * 25,000,000 / UTILISED (UGX) 0 / REMAINING (UGX) 25,000,000' prominently and
 * still offered New Claim, New Pre-Auth, New Endorsement and Add Dependent.
 * Clicking Add Dependent loaded /members/new?principalId=… with the copy 'Enrol
 * a dependant under Valid Principal' — no warning that the principal is lapsed,
 * no block, no override step. **No point-in-time reason and no safe next action
 * is offered for the non-active state anywhere.**"
 *
 * The register's phrase "freshly loaded profile (not a stale tab)" is doing
 * work: it rules out staleness as the cause. The page simply never asked what
 * the status permitted.
 *
 * ## Why this is a shared module
 *
 * The acceptance is "lapsed member cannot invoke protected action **through UI
 * or forged request**". Hiding a button is not a control; the server has to
 * refuse too. One policy table, consulted by both, is the only way those two
 * answers cannot drift — and a UI that hides what the server would allow is its
 * own kind of defect.
 */

export type MemberAction = "CLAIM" | "PREAUTH" | "ENDORSEMENT" | "ADD_DEPENDANT";

export const MEMBER_ACTION_LABELS: Record<MemberAction, string> = {
  CLAIM: "New Claim",
  PREAUTH: "New Pre-Auth",
  ENDORSEMENT: "New Endorsement",
  ADD_DEPENDANT: "Add Dependent",
};

/**
 * Statuses in which cover is live and the member may transact.
 *
 * PENDING_ACTIVATION is deliberately absent: cover has not begun, so a claim
 * against it has no period to land in.
 */
const TRANSACTING_STATUSES = new Set(["ACTIVE"]);

/**
 * Statuses that are over. A lapse or suspension can be reversed; these cannot,
 * so the copy must not imply waiting will help.
 */
const TERMINAL_STATUSES = new Set([
  "TERMINATED",
  "TERMINATED_FRAUD",
  "TERMINATED_BREACH",
  "TERMINATED_DEATH",
  "CANCELLED_COOLING_OFF",
  "EXPIRED",
  "LAPSED_BEFORE_ACTIVATION",
]);

export interface ActionVerdict {
  allowed: boolean;
  /** Why not, in the operator's terms. Empty when allowed. */
  reason: string;
  /** What they can do instead. Empty when allowed. */
  nextAction: string;
}

/**
 * Whether `action` may be taken on a member in `status`.
 *
 * Every refusal carries a reason AND a next action, because the run's finding
 * was not only that the product allowed too much — it was that "no point-in-time
 * reason and no safe next action is offered for the non-active state anywhere".
 */
export function canPerformMemberAction(status: string, action: MemberAction): ActionVerdict {
  if (TRANSACTING_STATUSES.has(status)) {
    return { allowed: true, reason: "", nextAction: "" };
  }

  const label = MEMBER_ACTION_LABELS[action];
  const readable = humanStatus(status);

  if (TERMINAL_STATUSES.has(status)) {
    return {
      allowed: false,
      reason: `${label} is not available: this membership is ${readable} and cannot be reinstated.`,
      nextAction:
        action === "ADD_DEPENDANT"
          ? "Enrol the dependant under a different principal, or start a new membership."
          : "Start a new membership if cover is needed.",
    };
  }

  if (status === "PENDING_ACTIVATION") {
    return {
      allowed: false,
      reason: `${label} is not available yet: cover has not started.`,
      nextAction: "Activate the membership first.",
    };
  }

  // LAPSED, SUSPENDED — reversible, so say so.
  return {
    allowed: false,
    reason: `${label} is not available while this membership is ${readable}. Cover is not in force, so nothing can be claimed against it.`,
    nextAction:
      status === "LAPSED"
        ? "Reinstate within the catch-up window, or start a new assessment."
        : "Lift the suspension first.",
  };
}

/** True when the member's benefit limits are usable right now. */
export function limitsAreUsable(status: string): boolean {
  return TRANSACTING_STATUSES.has(status);
}

/**
 * The caveat shown beside a limit that is displayed but not usable.
 *
 * The limits are still SHOWN — an operator answering "what would they have had"
 * needs them, and blanking the figures would replace one wrong answer with
 * another. What changes is that they are no longer presented as available.
 */
export function limitCaveat(status: string): string | null {
  if (limitsAreUsable(status)) return null;
  return `Not currently usable — this membership is ${humanStatus(status)}.`;
}

export function humanStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}
