/**
 * UAT-HF P01.05 — calendar days, kept strictly apart from instants (DEC-01).
 *
 * A cover start, a date of birth, a last-covered day and a waiting-period
 * eligible-from date are **calendar days**. They have no time and no timezone.
 * An audit timestamp or a session expiry is an **instant**. Storing the first as
 * the second is what produces off-by-one eligibility near midnight, and it is the
 * root of several findings:
 *
 *   DEF-017  the SAME endorsement rendered "7/1/2026" in the HR portal and
 *            "01/07/2026" in admin — six months apart on one value
 *   DEF-020  date fields showed no format hint and no timezone; "01/02" was
 *            interpreted silently by browser locale
 *   DEF-032  newborn cover start unconfirmable — only month granularity shown
 *   DEF-050  an unguarded `toISOString()` on a bad value threw
 *            `RangeError: Invalid time value` and took out a whole module
 *
 * The rule this file exists to enforce: a calendar day is a `YYYY-MM-DD` string,
 * never a `Date`. Convert to a `Date` only at the database boundary, and only via
 * `calendarDateToUtcDate`, which pins midnight UTC so the day cannot drift.
 *
 * Extends `src/lib/dates.ts` (ELIG-GAP-007), which owns instant parsing. Nothing
 * here replaces it.
 */
import { OPERATIONAL_LOCALE, OPERATIONAL_TIMEZONE } from "@/lib/locale-config";

/**
 * A calendar day in `YYYY-MM-DD`.
 *
 * Kept as a plain string so it serialises through Server Actions, JSON and form
 * data untouched — the moment it becomes a `Date` it acquires a timezone it does
 * not have.
 */
export type CalendarDate = string;

/** Strict `YYYY-MM-DD`: exactly four digits of year, so 12026 and 226 are rejected. */
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** DEC-02: the accepted technical range. Wider than any commercial rule. */
export const MIN_CALENDAR_DATE: CalendarDate = "1900-01-01";
export const MAX_CALENDAR_DATE: CalendarDate = "9999-12-31";

/**
 * Parse a calendar day. Returns null for anything that is not a real day.
 *
 * Rejects, deliberately:
 *   * five- and six-digit years — DEF-050's contract row had an absurd year
 *   * impossible days such as `2026-02-30` and `2026-04-31`, which `new Date()`
 *     silently rolls forward into March/May
 *   * anything carrying a time component: that is an instant, not a calendar day
 */
export function parseCalendarDate(input: string | null | undefined): CalendarDate | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const match = CALENDAR_DATE_RE.exec(trimmed);
  if (!match) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  // Round-trip through UTC to reject 2026-02-30 rather than rolling it into March.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }
  if (trimmed < MIN_CALENDAR_DATE || trimmed > MAX_CALENDAR_DATE) return null;
  return trimmed;
}

export function isCalendarDate(value: unknown): value is CalendarDate {
  return typeof value === "string" && parseCalendarDate(value) !== null;
}

/**
 * The calendar day an instant falls on, in the operational timezone.
 *
 * Uses `Intl` parts rather than `toISOString().slice(0, 10)`, which would answer
 * in UTC and be wrong for three hours of every Ugandan day.
 */
export function calendarDateFromInstant(
  instant: Date,
  timeZone: string = OPERATIONAL_TIMEZONE,
): CalendarDate | null {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return parseCalendarDate(`${get("year")}-${get("month")}-${get("day")}`);
}

/**
 * The `Date` to store for a calendar day: **midnight UTC**.
 *
 * Never `new Date("2026-08-11")` in local time and never a local-midnight Date —
 * either can land on the previous or next day once the server timezone differs
 * from the operator's.
 */
export function calendarDateToUtcDate(value: CalendarDate): Date | null {
  const parsed = parseCalendarDate(value);
  if (!parsed) return null;
  const [y, m, d] = parsed.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The calendar day stored in a date-only database column. */
export function calendarDateFromUtcDate(value: Date | null | undefined): CalendarDate | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return calendarDateFromInstant(value, "UTC");
}

/** Today, in the operational timezone. */
export function todayCalendarDate(now: Date = new Date()): CalendarDate {
  // The operational zone is fixed and valid, so this cannot be null in practice.
  return calendarDateFromInstant(now) ?? "1970-01-01";
}

/** Shift by whole days. Negative goes backwards. Null for an invalid input. */
export function addCalendarDays(value: CalendarDate, days: number): CalendarDate | null {
  const utc = calendarDateToUtcDate(value);
  if (!utc || !Number.isInteger(days)) return null;
  utc.setUTCDate(utc.getUTCDate() + days);
  return calendarDateFromUtcDate(utc);
}

/** Negative when a is earlier. Lexicographic order IS chronological for ISO days. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from a to b; negative when b is earlier. */
export function differenceInCalendarDays(a: CalendarDate, b: CalendarDate): number | null {
  const from = calendarDateToUtcDate(a);
  const to = calendarDateToUtcDate(b);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * **DEC-12.** The entered date is the LAST COVERED DAY; ineligibility begins the
 * following local calendar day.
 *
 * "Termination date" is exactly the field users get wrong, so this is a named
 * function rather than an inline `+1` scattered across the lifecycle code.
 */
export function ineligibleFromLastCoveredDay(lastCoveredDay: CalendarDate): CalendarDate | null {
  return addCalendarDays(lastCoveredDay, 1);
}

/** True when `day` is on or before the last covered day — i.e. still covered. */
export function isCoveredOn(day: CalendarDate, lastCoveredDay: CalendarDate | null): boolean {
  if (!parseCalendarDate(day)) return false;
  if (!lastCoveredDay) return true; // open-ended cover
  const last = parseCalendarDate(lastCoveredDay);
  if (!last) return false;
  return compareCalendarDates(day, last) <= 0;
}

// ── display ─────────────────────────────────────────────────────────────────

/**
 * The one user-facing calendar-date format: `11 Aug 2026`.
 *
 * Unambiguous by construction. DEF-017 found the same value read six months
 * apart across two portals because one rendered DD/MM and the other M/D; a named
 * month cannot be misread that way.
 */
export function formatCalendarDate(value: CalendarDate | null | undefined): string {
  const parsed = parseCalendarDate(value ?? null);
  // DEF-050: never throw on a bad stored value. Say so instead.
  if (!parsed) return "Invalid date — repair required";
  const [y, m, d] = parsed.split("-").map(Number);
  return new Intl.DateTimeFormat(OPERATIONAL_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * An instant, with its timezone shown.
 *
 * DEF-020: "Date fields show no format hint and no timezone." When the time of
 * day matters, the zone is part of the value — omitting it makes an audit
 * timestamp unfalsifiable.
 */
export function formatInstant(
  value: Date | null | undefined,
  options: { timeZone?: string; showZone?: boolean } = {},
): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Invalid date — repair required";
  }
  const timeZone = options.timeZone ?? OPERATIONAL_TIMEZONE;
  const formatted = new Intl.DateTimeFormat(OPERATIONAL_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
  return options.showZone === false ? formatted : `${formatted} EAT`;
}

/** Copy shown wherever a stored date cannot be rendered (P02.02). */
export const INVALID_DATE_LABEL = "Invalid date — repair required";

/**
 * Display a date that came out of the database.
 *
 * This is the DEF-050 guard. `someDate.toISOString().slice(0, 10)` on a damaged
 * row threw inside the contract register's `Array.map`, so ONE bad row stopped
 * the whole list rendering for every user. Rendering must degrade to a label,
 * never throw.
 */
export function formatStoredDate(value: Date | null | undefined, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const day = calendarDateFromUtcDate(value);
  return day ? formatCalendarDate(day) : INVALID_DATE_LABEL;
}

/**
 * The `YYYY-MM-DD` value for an `<input type="date">`, or "" when the stored
 * value cannot be represented. An unrenderable date must leave the field EMPTY
 * rather than crash the form that exists to correct it.
 */
export function calendarInputValue(value: Date | null | undefined): string {
  if (value == null) return "";
  return calendarDateFromUtcDate(value) ?? "";
}

/** True when a stored date can be rendered and used in date arithmetic. */
export function isRenderableStoredDate(value: Date | null | undefined): boolean {
  if (value == null) return true;
  return calendarDateFromUtcDate(value) !== null;
}

/** The hint every date input needs, so nobody has to guess DD/MM vs MM/DD. */
export const CALENDAR_DATE_INPUT_HINT = "DD/MM/YYYY";

/** Human readback for a typed date, e.g. confirming a cover start (DEF-032). */
export function calendarDateReadback(value: CalendarDate | null | undefined, label: string): string {
  const parsed = parseCalendarDate(value ?? null);
  if (!parsed) return `${label}: not set`;
  return `${label}: ${formatCalendarDate(parsed)}`;
}
