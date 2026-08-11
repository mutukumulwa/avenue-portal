/**
 * ELIG-GAP-007 — shared valid-date parsing.
 *
 * `new Date("not-a-date")` yields an `Invalid Date` object (not null, not a
 * throw), which then blows up downstream (`getTime()` → NaN, Prisma validation
 * error → 500, `.toISOString()` → RangeError). Parse user/URL/body-supplied
 * dates through these helpers so an invalid value becomes a controlled null /
 * fallback rather than an Invalid Date that reaches business logic or the DB.
 */

/** Parse to a valid Date, or null when the input is empty or not a real date. */
export function parseValidDate(input: string | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse to a valid Date, falling back to `fallback` when empty/invalid. */
export function parseValidDateOr(input: string | null | undefined, fallback: Date): Date {
  return parseValidDate(input) ?? fallback;
}

/** True when the string is a parseable date (empty/undefined counts as "not provided", so true). */
export function isValidDateInput(input: string | null | undefined): boolean {
  return input == null || input === "" || parseValidDate(input) !== null;
}
