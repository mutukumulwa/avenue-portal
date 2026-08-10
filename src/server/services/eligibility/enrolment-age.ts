/**
 * enrolment-age.ts — WP-3.5D: age gate at every enrolment WRITE path.
 *
 * Reuses the ONE calendar-correct age helper (`computeAge` in `age.ts`) so
 * enrolment enforcement can never drift from the SP-6 eligibility evaluator's
 * AGE_BOUNDARY / OVER_AGE_DEPENDANT decision. It does NOT re-implement age math.
 *
 * Rule (M-008/009/010, EO-015/016):
 *   - PRINCIPAL strictly over `Package.maxAge`            → reject
 *   - CHILD     strictly over `Package.dependentMaxAge`   → reject
 *   - exactly at the cap                                  → ELIGIBLE (last covered year)
 *   - SPOUSE / PARENT                                     → no child cap (a 40-year-old
 *                                                           spouse must never age out)
 *   - future date of birth / impossible age (> 120y)     → reject
 *
 * `age.ts::classifyAge` deliberately never blocks a principal for age (it only
 * flags the boundary) because "principal age-out is an enrolment/renewal
 * decision (WP-3.5D)" — this guard is that decision.
 */

import { computeAge } from "./age";

/** Package age caps. Columns are non-null Ints in the schema; null = no cap. */
export type EnrolmentAgeRules = {
  maxAge: number | null; // principal cap
  dependentMaxAge: number | null; // child (non-spouse dependant) cap
};

export type EnrolmentAgeResult =
  | { ok: true; age: number | null }
  | { ok: false; reason: string; age: number | null };

/** Above this, a date of birth is treated as data corruption rather than a real age. */
export const MAX_HUMAN_AGE = 120;

/**
 * Gate a member against the package age caps as of the enrolment/effective date.
 * Returns `{ ok:false, reason }` with a member-safe message on rejection.
 */
export function checkEnrolmentAge(
  member: { relationship?: string | null; dateOfBirth: Date | string | null | undefined },
  asOf: Date,
  rules: EnrolmentAgeRules | null | undefined,
): EnrolmentAgeResult {
  const dob = member.dateOfBirth ? new Date(member.dateOfBirth) : null;
  if (!dob || Number.isNaN(dob.getTime())) {
    return { ok: false, reason: "A valid date of birth is required.", age: null };
  }
  if (dob.getTime() > asOf.getTime()) {
    return { ok: false, reason: "Date of birth cannot be in the future.", age: null };
  }

  const age = computeAge(dob, asOf);
  if (age > MAX_HUMAN_AGE) {
    return { ok: false, reason: `Date of birth implies an impossible age (${age} years).`, age };
  }

  const relationship = member.relationship ?? "PRINCIPAL";
  const isPrincipal = relationship === "PRINCIPAL";
  const isChild = relationship === "CHILD";
  const cap = isPrincipal ? rules?.maxAge ?? null : isChild ? rules?.dependentMaxAge ?? null : null;

  if (cap != null && age > cap) {
    const who = isPrincipal ? "Principal" : "Dependant";
    const label = isPrincipal ? "maximum age" : "maximum dependant age";
    return {
      ok: false,
      reason: `${who} is ${age} years old, exceeding the package ${label} of ${cap}.`,
      age,
    };
  }
  return { ok: true, age };
}

/** Throwing wrapper for service paths that surface a plain `Error`. */
export function assertEnrolmentAge(
  member: { relationship?: string | null; dateOfBirth: Date | string | null | undefined; firstName?: string; lastName?: string },
  asOf: Date,
  rules: EnrolmentAgeRules | null | undefined,
): void {
  const result = checkEnrolmentAge(member, asOf, rules);
  if (!result.ok) {
    const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
    throw new Error(name ? `${name}: ${result.reason}` : result.reason);
  }
}
