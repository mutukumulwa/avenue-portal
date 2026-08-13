/**
 * UAT-HF P07.01 — the member lifecycle transition command and policy table.
 *
 * The run's finding, across DEF-040/041/042/043/058/059/077/081, is one shape
 * repeated: lifecycle changes were **fragmented direct actions**. A status
 * dropdown here, a micro-form there, each with its own idea of what was
 * allowed, what needed a reason, and who could do it. DEF-040 is the sharpest
 * instance — "Standard Cancel" terminating a member on one unconfirmed click,
 * from the same form used for spelling corrections.
 *
 * `member-status.ts` already models what the **edit dropdown** may do. That is
 * a subset of the lifecycle by design, and it is not the policy: it cannot say
 * who may act, whether a reason is required, whether a checker must approve, or
 * what the consequences are. This is that policy, enumerated.
 *
 * ## The rules encoded here
 *
 * **A transition names its channel.** `EDIT_FORM` transitions may be performed
 * from the general profile form; `GOVERNED_FLOW` ones may not, whatever the
 * caller. That single field is the DEF-040 prohibition — "forbidden same-form
 * transitions" in P07.01's acceptance — expressed once rather than re-derived
 * per screen.
 *
 * **Terminal is terminal.** Nothing leaves a terminal status through this
 * table. Reinstatement is its own governed flow with its own preconditions
 * (catch-up window, waiting-period preservation); a lifecycle table that let a
 * TERMINATED member become ACTIVE would quietly bypass all of it.
 *
 * **History is corrected by compensating events, never edited.** A transition
 * applied in error is withdrawn by a further recorded transition. There is no
 * "undo" here and there is deliberately no way to express one.
 *
 * **DEC-12 travels with the command.** The date a maker types is the LAST
 * COVERED DAY; ineligibility begins the following local calendar day. It is on
 * the command rather than left to each caller because "termination date" is
 * precisely the field users get wrong, and two callers disagreeing about it is
 * a day of claims.
 */

export const MEMBER_STATUSES = [
  "PENDING_ACTIVATION",
  "ACTIVE",
  "SUSPENDED",
  "LAPSED",
  "LAPSED_BEFORE_ACTIVATION",
  "TERMINATED",
  "CANCELLED_COOLING_OFF",
  "TERMINATED_FRAUD",
  "TERMINATED_BREACH",
  "TERMINATED_DEATH",
  "EXPIRED",
] as const;

export type MemberStatusValue = (typeof MEMBER_STATUSES)[number];

/** Where a transition may be performed from. */
export type TransitionChannel =
  /** Reachable from the general member edit form. */
  | "EDIT_FORM"
  /** Only through its own governed flow, with its own confirmation surface. */
  | "GOVERNED_FLOW";

export interface TransitionPolicy {
  from: MemberStatusValue;
  to: MemberStatusValue;
  channel: TransitionChannel;
  /** Roles permitted to request it. Empty means "no role may" (unreachable). */
  roles: readonly string[];
  /** A free-text reason is mandatory. */
  requiresReason: boolean;
  /** A second person must approve before it takes effect (DEC-03 separation). */
  requiresApproval: boolean;
  /** The member's cover ends on this transition, so DEC-12's date applies. */
  endsCover: boolean;
  /** Distinct audit action, so the trail names the event. */
  auditAction: string;
}

const OPS = ["SUPER_ADMIN", "ADMIN", "MEMBER_OPS"] as const;
const OPS_ONLY_SENIOR = ["SUPER_ADMIN", "ADMIN"] as const;

/**
 * Every permitted transition. Anything absent is forbidden — the table is
 * exhaustive by construction, which is what makes the from/to test meaningful.
 */
export const LIFECYCLE_POLICY: readonly TransitionPolicy[] = [
  // ── Activation ──────────────────────────────────────────────────────────
  {
    from: "PENDING_ACTIVATION", to: "ACTIVE", channel: "EDIT_FORM", roles: OPS,
    requiresReason: false, requiresApproval: false, endsCover: false,
    auditAction: "MEMBER_ACTIVATED",
  },
  {
    // Bound but the first contribution never arrived. Not a termination: the
    // member never had cover to lose, and the distinction matters at renewal.
    from: "PENDING_ACTIVATION", to: "LAPSED_BEFORE_ACTIVATION", channel: "GOVERNED_FLOW", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: true,
    auditAction: "MEMBER_LAPSED_BEFORE_ACTIVATION",
  },

  // ── Suspension and reinstatement ────────────────────────────────────────
  {
    from: "ACTIVE", to: "SUSPENDED", channel: "EDIT_FORM", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: false,
    auditAction: "MEMBER_SUSPENDED",
  },
  {
    from: "SUSPENDED", to: "ACTIVE", channel: "EDIT_FORM", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: false,
    auditAction: "MEMBER_REINSTATED",
  },

  // ── Lapse ───────────────────────────────────────────────────────────────
  {
    from: "ACTIVE", to: "LAPSED", channel: "EDIT_FORM", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: true,
    auditAction: "MEMBER_LAPSED",
  },
  {
    from: "SUSPENDED", to: "LAPSED", channel: "EDIT_FORM", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: true,
    auditAction: "MEMBER_LAPSED",
  },
  {
    // Lapse reinstatement runs the catch-up window and preserves waiting
    // periods, so it is never a free status flip.
    from: "LAPSED", to: "ACTIVE", channel: "GOVERNED_FLOW", roles: OPS,
    requiresReason: true, requiresApproval: true, endsCover: false,
    auditAction: "MEMBER_REINSTATED_FROM_LAPSE",
  },

  // ── Termination ─────────────────────────────────────────────────────────
  //
  // DEF-040: reachable ONLY through its own flow. It was a dropdown value
  // beside "correct a spelling", committed by the same Save button.
  ...(["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED", "LAPSED"] as const).map(
    (from): TransitionPolicy => ({
      from, to: "TERMINATED", channel: "GOVERNED_FLOW", roles: OPS,
      requiresReason: true, requiresApproval: true, endsCover: true,
      auditAction: "MEMBER_TERMINATED",
    }),
  ),
  {
    // Within the cooling-off window: the policy is unwound, not ended.
    from: "PENDING_ACTIVATION", to: "CANCELLED_COOLING_OFF", channel: "GOVERNED_FLOW", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: true,
    auditAction: "MEMBER_CANCELLED_COOLING_OFF",
  },
  {
    from: "ACTIVE", to: "CANCELLED_COOLING_OFF", channel: "GOVERNED_FLOW", roles: OPS,
    requiresReason: true, requiresApproval: false, endsCover: true,
    auditAction: "MEMBER_CANCELLED_COOLING_OFF",
  },
  ...(["ACTIVE", "SUSPENDED"] as const).map(
    (from): TransitionPolicy => ({
      // Fraud and breach are accusations as well as terminations. Senior role,
      // reason, and a checker — a single operator must not be able to brand a
      // member fraudulent alone.
      from, to: "TERMINATED_FRAUD", channel: "GOVERNED_FLOW", roles: OPS_ONLY_SENIOR,
      requiresReason: true, requiresApproval: true, endsCover: true,
      auditAction: "MEMBER_TERMINATED_FRAUD",
    }),
  ),
  ...(["ACTIVE", "SUSPENDED"] as const).map(
    (from): TransitionPolicy => ({
      from, to: "TERMINATED_BREACH", channel: "GOVERNED_FLOW", roles: OPS_ONLY_SENIOR,
      requiresReason: true, requiresApproval: true, endsCover: true,
      auditAction: "MEMBER_TERMINATED_BREACH",
    }),
  ),
  ...(["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED", "LAPSED"] as const).map(
    (from): TransitionPolicy => ({
      // Death needs no checker: delaying it leaves cover open on a deceased
      // member and asks a family to wait for a second signature.
      from, to: "TERMINATED_DEATH", channel: "GOVERNED_FLOW", roles: OPS,
      requiresReason: true, requiresApproval: false, endsCover: true,
      auditAction: "MEMBER_TERMINATED_DEATH",
    }),
  ),

  // ── Expiry ──────────────────────────────────────────────────────────────
  ...(["ACTIVE", "SUSPENDED"] as const).map(
    (from): TransitionPolicy => ({
      // Time passing, not a decision. No approval, but still a recorded event.
      from, to: "EXPIRED", channel: "GOVERNED_FLOW", roles: OPS,
      requiresReason: false, requiresApproval: false, endsCover: true,
      auditAction: "MEMBER_EXPIRED",
    }),
  ),
];

/** Statuses from which no transition leaves. */
export const TERMINAL_STATUSES: readonly MemberStatusValue[] = MEMBER_STATUSES.filter(
  (s) => !LIFECYCLE_POLICY.some((p) => p.from === s),
);

/** The command P07.01 specifies, in full. */
export interface LifecycleCommand {
  memberId: string;
  /** Guards against acting on a stale view — the transition is refused if the member has moved. */
  fromStatus: MemberStatusValue;
  /** Optimistic concurrency, so two operators cannot both apply from one read. */
  fromVersion: number;
  toStatus: MemberStatusValue;
  reasonCode?: string;
  reasonNote?: string;
  /** DEC-12: the LAST COVERED DAY, not the first uncovered one. */
  lastCoveredDay?: string;
  requestedAt: Date;
  /** Who is asking. */
  makerId: string;
  makerRole: string;
  /** Who approved, where the policy requires a second person. */
  checkerId?: string;
  /** Makes a retried command a replay rather than a second transition. */
  idempotencyKey: string;
}

export type TransitionRefusal =
  | "NOT_PERMITTED"
  | "TERMINAL"
  | "WRONG_CHANNEL"
  | "ROLE_NOT_PERMITTED"
  | "REASON_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "SELF_APPROVAL"
  | "LAST_COVERED_DAY_REQUIRED"
  | "STALE";

export type TransitionDecision =
  | { allowed: true; policy: TransitionPolicy; effect: string }
  | { allowed: false; refusal: TransitionRefusal; message: string };

/** Find the policy for a pair, or undefined when the transition is forbidden. */
export function policyFor(
  from: MemberStatusValue,
  to: MemberStatusValue,
): TransitionPolicy | undefined {
  return LIFECYCLE_POLICY.find((p) => p.from === from && p.to === to);
}

/**
 * Decide a command against the table.
 *
 * Pure and total: every from/to pair has an answer, and the answer for an
 * unlisted pair is a refusal rather than a thrown error — a lifecycle
 * evaluator that throws on an unexpected pair is one that fails open somewhere
 * upstream.
 */
export function evaluateTransition(
  command: LifecycleCommand,
  context: { channel: TransitionChannel; currentStatus: MemberStatusValue; currentVersion: number },
): TransitionDecision {
  // Staleness first. Everything below reasons about a status the caller
  // believes the member has, and if that belief is wrong nothing else matters.
  if (
    context.currentStatus !== command.fromStatus ||
    context.currentVersion !== command.fromVersion
  ) {
    return {
      allowed: false,
      refusal: "STALE",
      message: `This member is no longer ${command.fromStatus.replace(/_/g, " ").toLowerCase()}. Reload and check the current status before acting.`,
    };
  }

  if (command.fromStatus === command.toStatus) {
    return {
      allowed: false,
      refusal: "NOT_PERMITTED",
      message: "That is the member's current status, so there is nothing to change.",
    };
  }

  if (TERMINAL_STATUSES.includes(command.fromStatus)) {
    return {
      allowed: false,
      refusal: "TERMINAL",
      message:
        "This member's cover has already ended and that cannot be undone here. Reinstatement is a separate governed process.",
    };
  }

  const policy = policyFor(command.fromStatus, command.toStatus);
  if (!policy) {
    return {
      allowed: false,
      refusal: "NOT_PERMITTED",
      message: `A member cannot go from ${command.fromStatus.replace(/_/g, " ").toLowerCase()} to ${command.toStatus.replace(/_/g, " ").toLowerCase()}.`,
    };
  }

  // DEF-040. The transition may be legal and still not legal *here*.
  if (policy.channel === "GOVERNED_FLOW" && context.channel !== "GOVERNED_FLOW") {
    return {
      allowed: false,
      refusal: "WRONG_CHANNEL",
      message:
        "This change ends or restarts cover, so it cannot be made from the profile form. Use the dedicated action, which explains the consequences first.",
    };
  }

  if (!policy.roles.includes(command.makerRole)) {
    return {
      allowed: false,
      refusal: "ROLE_NOT_PERMITTED",
      message: "You do not have permission to make this change.",
    };
  }

  if (policy.requiresReason && !(command.reasonNote ?? "").trim() && !(command.reasonCode ?? "").trim()) {
    return {
      allowed: false,
      refusal: "REASON_REQUIRED",
      message: "Say why. This change is recorded against the member and a reason is required.",
    };
  }

  if (policy.requiresApproval) {
    if (!command.checkerId) {
      return {
        allowed: false,
        refusal: "APPROVAL_REQUIRED",
        message: "This change needs a second person to approve it before it takes effect.",
      };
    }
    // DEC-03. A maker who can also check is one person with two hats.
    if (command.checkerId === command.makerId) {
      return {
        allowed: false,
        refusal: "SELF_APPROVAL",
        message: "The person who requested this change cannot also approve it.",
      };
    }
  }

  // DEC-12: a cover-ending transition without a last covered day cannot be
  // applied, because the day itself is the thing people get wrong.
  if (policy.endsCover && !(command.lastCoveredDay ?? "").trim()) {
    return {
      allowed: false,
      refusal: "LAST_COVERED_DAY_REQUIRED",
      message: "Enter the last day this member is covered. Cover ends at the end of that day.",
    };
  }

  return { allowed: true, policy, effect: describeEffect(policy, command) };
}

/**
 * The consequences preview P07.01 requires — computed from the same policy the
 * write uses, so the sentence shown before confirming cannot describe something
 * other than what happens.
 */
export function describeEffect(policy: TransitionPolicy, command: LifecycleCommand): string {
  if (!policy.endsCover) {
    return policy.to === "SUSPENDED"
      ? "Claims will be refused while the member is suspended. Cover is not ended and can be restored."
      : "The member's cover continues.";
  }
  const day = command.lastCoveredDay ?? "the date entered";
  // DEC-12 read back in words, because "termination date" is the field users
  // get wrong and off-by-one here is a day of claims.
  return `The member remains covered through ${day} inclusive, and is not covered from the day after. Claims for care on ${day} are still payable.`;
}
