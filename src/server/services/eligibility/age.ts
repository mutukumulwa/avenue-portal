/**
 * age.ts — ONE calendar-correct age helper for the eligibility surface (SP-6).
 *
 * The sweep found three divergent `365.25`-based age copies (admin member page,
 * member-app, renewal reclassifier) that drift by a day near birthdays. The
 * evaluator's AGE_BOUNDARY / OVER_AGE_DEPENDANT oracle rows (EO-015 "exactly max
 * dependant age" vs EO-016 "one day over") turn on that exact day, so the
 * evaluator uses this completed-calendar-years helper instead. WP-3.5D adopts the
 * same helper at every enrolment/renewal path.
 */

/** Completed calendar years between `dob` and `asOf` (never negative-rounded). */
export function computeAge(dob: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDelta = asOf.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export type AgeClassification = {
  /** Dependant strictly over the applicable max age → OVER_AGE_DEPENDANT (block). */
  over: boolean;
  /** Exactly at the applicable max age → AGE_BOUNDARY (eligible, flagged). */
  boundary: boolean;
  age: number | null;
};

/**
 * Classify a member's age against the package's principal/dependant max age.
 *
 * - CHILD dependant: `age > dependentMaxAge` → over (block, OVER_AGE_DEPENDANT);
 *   `age === dependentMaxAge` → boundary (eligible, last covered year).
 * - Principal: only flagged at exactly `maxAge` (boundary); never blocked here —
 *   principal age-out is an enrolment/renewal decision (WP-3.5D), and no oracle
 *   code blocks a principal for age.
 * - SPOUSE / PARENT: adult dependants, NOT subject to the child age cap (a
 *   40-year-old spouse on a maternity family pool must not age out — the EO-017
 *   bug this guards).
 */
export function classifyAge(
  member: { relationship: string; dateOfBirth: Date | null },
  asOf: Date,
  rules: { maxAge: number | null; dependentMaxAge: number | null } | null | undefined,
): AgeClassification {
  if (!rules || !member.dateOfBirth) return { over: false, boundary: false, age: null };
  const isPrincipal = member.relationship === "PRINCIPAL";
  const isChild = member.relationship === "CHILD";
  const cap = isPrincipal ? rules.maxAge : isChild ? rules.dependentMaxAge : null;
  if (cap == null) return { over: false, boundary: false, age: computeAge(member.dateOfBirth, asOf) };
  const age = computeAge(member.dateOfBirth, asOf);
  if (age > cap) return { over: isChild, boundary: false, age };
  if (age === cap) return { over: false, boundary: true, age };
  return { over: false, boundary: false, age };
}
