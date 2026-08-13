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

export interface WaitingPeriodStatus {
  /** True when the member cannot use this benefit yet. */
  waiting: boolean;
  /** The first day it becomes usable, as a calendar date. Null when none applies. */
  eligibleFrom: string | null;
  /** Member-facing sentence. Empty when there is nothing to say. */
  label: string;
  /** Whole days still to wait. 0 once available. */
  daysRemaining: number;
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
  /** When this member's cover began. */
  coverStartDate: Date | string | null | undefined;
  now?: Date;
}): WaitingPeriodStatus {
  const days = input.waitingPeriodDays ?? 0;
  const none: WaitingPeriodStatus = { waiting: false, eligibleFrom: null, label: "", daysRemaining: 0 };
  if (days <= 0 || !input.coverStartDate) return none;

  const start = calendarDateFromInstant(new Date(input.coverStartDate));
  if (!start) return none;

  const eligibleFrom = addCalendarDays(start, days);
  if (!eligibleFrom) return none;

  const today = calendarDateFromInstant(input.now ?? new Date());
  if (!today) return none;

  if (today >= eligibleFrom) {
    return { waiting: false, eligibleFrom, label: "", daysRemaining: 0 };
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
  coverStartDate?: Date | string | null;
  referralRules?: readonly ReferralRuleLike[];
  exclusionRules?: readonly ExclusionRuleLike[];
  now?: Date;
}): { notes: PolicyNote[]; waiting: WaitingPeriodStatus } {
  const now = input.now ?? new Date();
  const waiting = waitingPeriodStatus({
    waitingPeriodDays: input.waitingPeriodDays,
    coverStartDate: input.coverStartDate,
    now,
  });

  const notes: PolicyNote[] = [];
  if (waiting.waiting) notes.push({ kind: "WAITING", text: waiting.label });
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
