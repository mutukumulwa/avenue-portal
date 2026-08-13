/**
 * UAT-HF P09.07 — the policy a member is actually subject to, in words they can
 * read (DEF-060, DEF-061, DEF-023).
 *
 * DEF-060 (S2): "The package carries an active referral rule with the
 * member-safe explanation 'Specialist outpatient visits require a referral from
 * your primary provider, except in an emergency.' ... Scanning /member/benefits,
 * /member/facilities and /member/preauth for referral or emergency language
 * returns nothing on all three. **Worse, /member/facilities offers a Procedure
 * picker including 'Specialist consultation' with a cost preview and no referral
 * note, so the product leads the member to plan and price exactly the visit that
 * will be refused.**"
 *
 * DEF-061 (S2): "A scan of /member/benefits for waiting-period language ...
 * returns nothing ... the member view implies every listed category is
 * immediately usable."
 *
 * The copy was already authored. `ReferralRule.memberSafeExplanation` exists and
 * is populated; nothing read it. So this is a read model, not new policy — which
 * is also why it can be one module shared by every audience, which is what
 * P09.07 asks for ("one effective policy read model").
 *
 * ## The one hard rule
 *
 * `sourceClause` is the internal contract reference and is marked in the schema
 * as "never member/provider-facing". Nothing here returns it, and
 * `assertNoInternalLeak` exists so a caller can prove it.
 */

import { formatCalendarDate, calendarDateFromInstant, addCalendarDays } from "@/lib/calendar-date";

/**
 * UAT-HF P09.03 — what a waiting period is measured from (DEF-022).
 *
 * Mirrors the `WaitingPeriodBasis` enum. Declared here rather than imported
 * from `@prisma/client` so this module stays usable by callers that hold a
 * plain string — the point of one read model is that every audience can reach
 * it, including ones that never touch the database.
 */
export type WaitingPeriodBasisValue =
  | "COVER_START"
  | "DEPENDANT_JOIN"
  | "REINSTATEMENT"
  | "OTHER_APPROVED";

/** The dates a basis can resolve against. Each is one the platform stores. */
export interface WaitingPeriodAnchors {
  /** The principal's cover start — the family's policy date. */
  coverStartDate?: Date | string | null;
  /** This member's own cover start; later than the above for a late dependant. */
  dependantJoinDate?: Date | string | null;
  /** Start of the current coverage period after a lapse. */
  reinstatementDate?: Date | string | null;
  /** An explicitly approved date held outside the standard fields. */
  approvedBasisDate?: Date | string | null;
}

/** Human-readable name of each basis, for maker and member copy alike. */
export const WAITING_PERIOD_BASIS_LABEL: Record<WaitingPeriodBasisValue, string> = {
  COVER_START: "the policy cover start date",
  DEPENDANT_JOIN: "the date this member joined the policy",
  REINSTATEMENT: "the date cover was reinstated",
  OTHER_APPROVED: "a separately approved start date",
};

export interface WaitingPeriodStatus {
  /** True when the member cannot use this benefit yet. */
  waiting: boolean;
  /** The first day it becomes usable, as a calendar date. Null when none applies. */
  eligibleFrom: string | null;
  /** Member-facing sentence. Empty when there is nothing to say. */
  label: string;
  /** Whole days still to wait. 0 once available. */
  daysRemaining: number;
  /**
   * True when a wait IS configured but its basis date is unknown, so no
   * eligible date could be computed.
   *
   * This is deliberately not folded into `waiting: false`. A rule that cannot
   * be evaluated is not a rule that does not apply, and reporting it as "no
   * wait" would tell a member their maternity cover is live when nobody knows.
   */
  unresolved: boolean;
}

/** Pick the date a basis measures from. Returns null when it is not known. */
export function resolveWaitingPeriodAnchor(
  basis: WaitingPeriodBasisValue,
  anchors: WaitingPeriodAnchors,
): Date | string | null {
  switch (basis) {
    case "DEPENDANT_JOIN":
      return anchors.dependantJoinDate ?? null;
    case "REINSTATEMENT":
      return anchors.reinstatementDate ?? null;
    case "OTHER_APPROVED":
      // No silent fallback to cover start. An approved basis that was never
      // recorded is a gap in the configuration, and answering from a different
      // date would give a confident wrong answer — the failure mode DEF-022 is
      // about in the first place.
      return anchors.approvedBasisDate ?? null;
    case "COVER_START":
    default:
      return anchors.coverStartDate ?? null;
  }
}

/**
 * Whether a benefit is still inside its waiting period, and from when it is not.
 *
 * The run's complaint was not that waiting periods were wrong — they are
 * configured correctly ("MATERNITY Fee for service 270d wait"). It was that the
 * member view "implies every listed category is immediately usable". So the
 * answer must carry a DATE, not a duration: "270 days" requires the member to
 * know when their cover started and to do arithmetic; "available from 8 May
 * 2027" does not.
 */
export function waitingPeriodStatus(input: {
  waitingPeriodDays: number | null | undefined;
  /** When this member's cover began. Also the COVER_START anchor. */
  coverStartDate: Date | string | null | undefined;
  /** P09.03 — which date the wait runs from. Defaults to the historic behaviour. */
  waitingPeriodBasis?: WaitingPeriodBasisValue;
  /** The other dates a non-default basis may need. */
  anchors?: WaitingPeriodAnchors;
  now?: Date;
}): WaitingPeriodStatus {
  const days = input.waitingPeriodDays ?? 0;
  const none: WaitingPeriodStatus = {
    waiting: false,
    eligibleFrom: null,
    label: "",
    daysRemaining: 0,
    unresolved: false,
  };
  if (days <= 0) return none;

  const basis = input.waitingPeriodBasis ?? "COVER_START";
  const anchor = resolveWaitingPeriodAnchor(basis, {
    coverStartDate: input.coverStartDate,
    ...input.anchors,
  });

  if (!anchor) {
    // A configured wait whose basis date is missing. Say so rather than
    // reporting "no wait" — see `unresolved`.
    return {
      ...none,
      unresolved: true,
      label: `A ${days}-day waiting period applies to this benefit, measured from ${WAITING_PERIOD_BASIS_LABEL[basis]}. We do not have that date on record, so we cannot yet tell you when it ends — please contact your administrator.`,
    };
  }

  const start = calendarDateFromInstant(new Date(anchor));
  if (!start) return none;

  const eligibleFrom = addCalendarDays(start, days);
  if (!eligibleFrom) return none;

  const today = calendarDateFromInstant(input.now ?? new Date());
  if (!today) return none;

  if (today >= eligibleFrom) {
    return { waiting: false, eligibleFrom, label: "", daysRemaining: 0, unresolved: false };
  }

  const remaining = Math.max(
    0,
    Math.ceil(
      (new Date(`${eligibleFrom}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );

  return {
    waiting: true,
    eligibleFrom,
    daysRemaining: remaining,
    unresolved: false,
    // Says what is true now, when it changes, and that the rest of the cover is
    // unaffected — the third clause is the one that stops a member assuming the
    // whole policy is dormant.
    label: `Not available yet — you can use this from ${formatCalendarDate(eligibleFrom)}. Your other benefits are unaffected.`,
  };
}

export interface PolicyNote {
  kind: "REFERRAL" | "EXCLUSION" | "WAITING";
  /** Member-safe text ONLY. Never a source clause. */
  text: string;
}

interface ReferralRuleLike {
  benefitCategories: string[];
  serviceCodes?: string[];
  requiresReferral: boolean;
  emergencyException?: boolean;
  memberSafeExplanation: string;
  isActive?: boolean;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
}

interface ExclusionRuleLike {
  benefitCategories?: string[];
  memberSafeExplanation: string;
  isActive?: boolean;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
}

function inForce(rule: { isActive?: boolean; effectiveFrom?: Date | string | null; effectiveTo?: Date | string | null }, now: Date): boolean {
  if (rule.isActive === false) return false;
  if (rule.effectiveFrom && new Date(rule.effectiveFrom) > now) return false;
  if (rule.effectiveTo && new Date(rule.effectiveTo) < now) return false;
  return true;
}

/**
 * The referral notes that apply to a benefit category, right now.
 *
 * Returns only `memberSafeExplanation`. A rule that requires no referral
 * produces no note — telling a member "no referral is needed here" on every
 * category is noise that buries the one place a referral IS needed.
 */
export function referralNotesFor(
  rules: readonly ReferralRuleLike[],
  category: string,
  now: Date = new Date(),
): PolicyNote[] {
  return rules
    .filter((r) => r.requiresReferral && inForce(r, now))
    .filter((r) => r.benefitCategories.length === 0 || r.benefitCategories.includes(category))
    .map((r) => ({ kind: "REFERRAL" as const, text: r.memberSafeExplanation }))
    .filter((n) => n.text.trim() !== "");
}

/** The exclusion notes that apply to a benefit category, right now. */
export function exclusionNotesFor(
  rules: readonly ExclusionRuleLike[],
  category: string,
  now: Date = new Date(),
): PolicyNote[] {
  return rules
    .filter((r) => inForce(r, now))
    .filter((r) => !r.benefitCategories?.length || r.benefitCategories.includes(category))
    .map((r) => ({ kind: "EXCLUSION" as const, text: r.memberSafeExplanation }))
    .filter((n) => n.text.trim() !== "");
}

/**
 * Everything a member should be told about one benefit category, in one call.
 *
 * P09.07 asks for "one effective policy read model" precisely so the benefits
 * view, Find Care and a pre-auth screen cannot disagree — the run found all
 * three silent, and three separate fixes would be three chances to stay silent.
 */
export function policyNotesForCategory(input: {
  category: string;
  waitingPeriodDays?: number | null;
  /** P09.03 — which date the wait runs from (DEF-022). */
  waitingPeriodBasis?: WaitingPeriodBasisValue;
  /** P09.03 — the other dates a non-default basis needs. */
  anchors?: WaitingPeriodAnchors;
  coverStartDate?: Date | string | null;
  referralRules?: readonly ReferralRuleLike[];
  exclusionRules?: readonly ExclusionRuleLike[];
  now?: Date;
}): { notes: PolicyNote[]; waiting: WaitingPeriodStatus } {
  const now = input.now ?? new Date();
  const waiting = waitingPeriodStatus({
    waitingPeriodDays: input.waitingPeriodDays,
    waitingPeriodBasis: input.waitingPeriodBasis,
    anchors: input.anchors,
    coverStartDate: input.coverStartDate,
    now,
  });

  const notes: PolicyNote[] = [];
  // P09.03: an UNRESOLVED wait must be said out loud too. A configured wait
  // whose basis date is missing produces no eligible date, and rendering
  // nothing would put the member back where DEF-061 found them — a benefit
  // that looks immediately usable when in fact nobody knows.
  if (waiting.waiting || waiting.unresolved) notes.push({ kind: "WAITING", text: waiting.label });
  notes.push(...referralNotesFor(input.referralRules ?? [], input.category, now));
  notes.push(...exclusionNotesFor(input.exclusionRules ?? [], input.category, now));

  return { notes, waiting };
}

/**
 * Whether a procedure a member is about to price needs a referral first.
 *
 * DEF-060's sharpest sentence: Find Care "offers a Procedure picker including
 * 'Specialist consultation' with a cost preview and no referral note, so the
 * product leads the member to plan and price exactly the visit that will be
 * refused". A cost estimate that omits the precondition is worse than no
 * estimate.
 */
export function referralWarningForProcedure(
  rules: readonly ReferralRuleLike[],
  input: { category?: string | null; serviceCode?: string | null },
  now: Date = new Date(),
): string | null {
  const hit = rules
    .filter((r) => r.requiresReferral && inForce(r, now))
    .find(
      (r) =>
        (input.serviceCode && r.serviceCodes?.includes(input.serviceCode)) ||
        (input.category && r.benefitCategories.includes(input.category)) ||
        (r.benefitCategories.length === 0 && !r.serviceCodes?.length),
    );
  return hit?.memberSafeExplanation?.trim() || null;
}

/**
 * Throw if anything member-facing carries an internal field.
 *
 * The schema comments say `sourceClause` is "never member/provider-facing", and
 * a comment is not a control. Callers building a member payload can assert it.
 */
export function assertNoInternalLeak(payload: unknown): void {
  const serialised = JSON.stringify(payload ?? null);
  if (serialised && /"sourceClause"/.test(serialised)) {
    throw new Error(
      "Internal policy source clause reached a member-facing payload. Only memberSafeExplanation may be shown.",
    );
  }
}

/**
 * UAT-HF P09.03 — the maker-facing half of the waiting-period disclosure
 * (DEF-022).
 *
 * The run configured a 270-day maternity wait and found "the entire maker-facing
 * disclosure is the fragment '270d wait' inside the benefit row ... The product
 * never states what the 270 days run FROM — cover start, enrolment date, policy
 * inception and member join date are all plausible and none is named — and it
 * never calculates or displays the resulting eligible-from date on any
 * maker-facing surface."
 *
 * The basis is not ambiguous in the code: `waitingPeriodStatus` above measures
 * from the member's **cover start date**, and that is what the member-facing
 * copy has said since P09.07. What was missing is that the authoring surface
 * never said it out loud, so a maker had no way to tell an employer when
 * maternity cover actually begins without guessing which of four dates applied.
 *
 * These live beside `waitingPeriodStatus` deliberately: if the basis ever
 * becomes configurable, both audiences change together or neither does.
 */

/** The basis every waiting period is measured from today. */
export const WAITING_PERIOD_BASIS = "the member's cover start date";

/**
 * The maker-facing sentence for a configured waiting period.
 *
 * Returns null when there is no wait, so a caller can render nothing rather than
 * "0 days from cover start", which reads like a rule where there is none.
 */
export function waitingPeriodAuthoringLabel(
  waitingPeriodDays: number | null | undefined,
  basis: WaitingPeriodBasisValue = "COVER_START",
): string | null {
  const days = waitingPeriodDays ?? 0;
  if (days <= 0) return null;
  // P09.03: the basis is named, not assumed. "270d wait" was the entire
  // maker-facing disclosure the run found, and four different start dates were
  // all plausible readings of it.
  return `${days} days from ${WAITING_PERIOD_BASIS_LABEL[basis]}`;
}

/**
 * A worked eligible-from date for a member whose cover starts on `from`.
 *
 * A package is not tied to one member, so no single eligible date exists for it.
 * What a maker can be given — and what answers the employer's actual question —
 * is the arithmetic done for them against a concrete start, defaulting to today.
 */
export function waitingPeriodWorkedExample(
  waitingPeriodDays: number | null | undefined,
  from: Date = new Date(),
): { eligibleFrom: string; label: string } | null {
  const days = waitingPeriodDays ?? 0;
  if (days <= 0) return null;

  const start = calendarDateFromInstant(from);
  if (!start) return null;
  const eligibleFrom = addCalendarDays(start, days);
  if (!eligibleFrom) return null;

  return {
    eligibleFrom,
    label: `A member whose cover starts ${formatCalendarDate(start)} is covered for this from ${formatCalendarDate(eligibleFrom)}.`,
  };
}
