/**
 * Shared, pure helpers for the structured-rule evaluators (WP-2.3 / WP-2.4).
 * No Prisma, no I/O — safe to unit-test and to reuse from SP-6, preauth, and the
 * claims path.
 */

/** Case/whitespace-insensitive code-set intersection. Empty `have` never
 *  matches (a rule dimension with no codes is "unspecified", not "matches all"). */
export function codeSetsIntersect(
  have: readonly string[] | undefined | null,
  want: readonly string[] | undefined | null,
): boolean {
  if (!have || !want || have.length === 0 || want.length === 0) return false;
  const norm = (s: string) => s.trim().toUpperCase();
  const set = new Set(want.map(norm));
  return have.some((x) => set.has(norm(x)));
}

/** Is a single value present in a set (case/whitespace-insensitive)? */
export function valueInSet(
  value: string | undefined | null,
  set: readonly string[] | undefined | null,
): boolean {
  if (!value || !set || set.length === 0) return false;
  const v = value.trim().toUpperCase();
  return set.some((s) => s.trim().toUpperCase() === v);
}

/** Is a versioned rule in force on `asOf`? Inclusive of both boundary dates;
 *  `effectiveTo == null` means open-ended. `isActive === false` is never in
 *  force. */
export function isRuleEffective(
  rule: { effectiveFrom: Date; effectiveTo?: Date | null; isActive?: boolean },
  asOf: Date,
): boolean {
  if (rule.isActive === false) return false;
  if (asOf.getTime() < rule.effectiveFrom.getTime()) return false;
  if (rule.effectiveTo && asOf.getTime() > rule.effectiveTo.getTime()) return false;
  return true;
}

/** Deterministic ordering for a rule set: newest `effectiveFrom` first, then by
 *  id — so evaluation is stable regardless of DB row order (a real bug class the
 *  Diagnosis-Gate C7 work found: DB row order deciding which rule ran). */
export function byEffectiveThenId<T extends { effectiveFrom: Date; id: string }>(
  a: T,
  b: T,
): number {
  return b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || a.id.localeCompare(b.id);
}
