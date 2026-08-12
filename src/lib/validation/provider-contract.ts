import { z } from "zod";
import {
  MAX_CALENDAR_DATE,
  MIN_CALENDAR_DATE,
  calendarDateFromUtcDate,
  calendarDateToUtcDate,
  parseCalendarDate,
} from "@/lib/calendar-date";

/**
 * UAT-HF P02.01 — canonical date validation for provider contracts (DEC-02).
 *
 * DEF-050 (S1) in one sentence from the run: one ordinary "Create draft" by a
 * permitted Underwriter-Maker, using only fields the product offers, persisted a
 * contract that both the register and the detail page then failed to render —
 * `/contracts` and `/contracts/{id}` threw for EVERY persona on EVERY load, and
 * `/contracts/{id}/edit` returned Page Not Found, so no UI route could reach the
 * row to correct or void it. The module was dead until someone edited the
 * database directly.
 *
 * The row carried **startDate 60901-02-20 and endDate 70831-02-20**.
 *
 * That is not exotic input. A native `<input type="date">` accepts years up to
 * 275760, so a keyboard user who overtypes the year field produces it trivially,
 * and `new Date(str)` accepted it without complaint — the create action did no
 * validation whatsoever.
 *
 * ── Scope of these rules (DEC-02) ───────────────────────────────────────────
 * Accept four-digit ISO calendar dates from 1900-01-01 to 9999-12-31, and require
 * `end >= start`. Nothing narrower.
 *
 * DEC-02 says so explicitly: "do not invent a narrower commercial duration."
 * A five-year maximum term, or a rule that a review date must fall inside the
 * term, are *commercial* policies nobody has signed — and inventing them here
 * would reject legitimate legacy rows during the P02.03 repair, turning a
 * containment fix into a data-loss one.
 *
 * Every write door imports this: the create action, the draft-header edit, the
 * renewal, the import path and the service layer. A validator only one door uses
 * is not a validator.
 */

/**
 * Callers hold a contract date in whichever form their door produced: a form
 * gives a `YYYY-MM-DD` string, a typed service caller may already hold a `Date`.
 * A validator that accepts only one of those pushes the conversion back out to
 * the call sites — which is how the unvalidated `new Date(str)` got there in the
 * first place. Normalise here instead.
 */
export function toCalendarDateInput(value: unknown): string | null {
  if (value instanceof Date) return calendarDateFromUtcDate(value);
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  return null;
}

/** Field labels, so an error names what the user sees. */
export const CONTRACT_DATE_LABELS: Record<string, string> = {
  startDate: "Start date",
  endDate: "End date",
  reviewDueDate: "Review due date",
};

const RANGE_MESSAGE = `Enter a date between ${MIN_CALENDAR_DATE} and ${MAX_CALENDAR_DATE}.`;

/**
 * One contract date. Rejects five- and six-digit years, impossible days such as
 * 2026-02-30, and anything with a time component.
 */
export const contractDate = z
  .string()
  .trim()
  .min(1, "Enter a date.")
  .refine((value) => parseCalendarDate(value) !== null, {
    // The same message for a malformed value and an out-of-range one: both mean
    // "this is not a date the system will accept", and naming the bound is the
    // actionable part.
    message: RANGE_MESSAGE,
  });

export const optionalContractDate = z
  .union([contractDate, z.literal(""), z.null(), z.undefined()])
  .transform((value) => (value === "" || value == null ? undefined : value));

/**
 * The contract term. `end >= start` is the one relational rule DEC-02 names.
 *
 * Equality is allowed: a single-day contract is unusual but not invalid, and
 * refusing it would be another invented commercial rule.
 */
export const contractTermSchema = z
  .object({
    startDate: contractDate,
    endDate: contractDate,
    reviewDueDate: optionalContractDate,
  })
  .superRefine((value, ctx) => {
    const start = parseCalendarDate(value.startDate);
    const end = parseCalendarDate(value.endDate);
    // Both are already known-valid here; the guard keeps TypeScript honest.
    if (!start || !end) return;
    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "The end date must be on or after the start date.",
      });
    }
  });

export type ContractTermInput = z.input<typeof contractTermSchema>;
export type ContractTerm = z.output<typeof contractTermSchema>;

export interface ContractTermDates {
  startDate: Date;
  endDate: Date;
  reviewDueDate: Date | null;
}

export type ContractTermResult =
  | { ok: true; dates: ContractTermDates }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Validate and convert in one step, so no caller is left holding a validated
 * string and still tempted to write `new Date(value)`.
 *
 * Conversion goes through `calendarDateToUtcDate`, which pins midnight UTC — a
 * local-midnight `Date` would land on the previous or next day depending on the
 * server's timezone.
 */
export function validateContractTerm(input: {
  startDate?: unknown;
  endDate?: unknown;
  reviewDueDate?: unknown;
}): ContractTermResult {
  const parsed = contractTermSchema.safeParse({
    startDate: toCalendarDateInput(input.startDate) ?? "",
    endDate: toCalendarDateInput(input.endDate) ?? "",
    reviewDueDate: input.reviewDueDate === undefined ? undefined : (toCalendarDateInput(input.reviewDueDate) ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  return {
    ok: true,
    dates: {
      startDate: calendarDateToUtcDate(parsed.data.startDate)!,
      endDate: calendarDateToUtcDate(parsed.data.endDate)!,
      reviewDueDate: parsed.data.reviewDueDate ? calendarDateToUtcDate(parsed.data.reviewDueDate) : null,
    },
  };
}

/**
 * Partial validation, for the draft-header edit where a field may be absent
 * meaning "leave unchanged". Absent stays absent; present must still be valid,
 * and if both term dates end up present they must still satisfy `end >= start`.
 */
export function validateContractTermPatch(
  input: { startDate?: unknown; endDate?: unknown; reviewDueDate?: unknown },
  current: { startDate: Date; endDate: Date },
): { ok: true; dates: Partial<ContractTermDates> } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  const dates: Partial<ContractTermDates> = {};

  for (const key of ["startDate", "endDate"] as const) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const parsed = parseCalendarDate(toCalendarDateInput(raw));
    if (!parsed) {
      fieldErrors[key] = [RANGE_MESSAGE];
      continue;
    }
    dates[key] = calendarDateToUtcDate(parsed)!;
  }

  if (input.reviewDueDate !== undefined) {
    const raw = input.reviewDueDate;
    if (raw === null || raw === "") {
      dates.reviewDueDate = null;
    } else {
      const parsed = parseCalendarDate(toCalendarDateInput(raw));
      if (!parsed) fieldErrors.reviewDueDate = [RANGE_MESSAGE];
      else dates.reviewDueDate = calendarDateToUtcDate(parsed)!;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // Check the resulting term, not only the supplied half: editing just the start
  // date can still invert a term whose end date is untouched.
  const effectiveStart = dates.startDate ?? current.startDate;
  const effectiveEnd = dates.endDate ?? current.endDate;
  if (
    Number.isFinite(effectiveStart?.getTime()) &&
    Number.isFinite(effectiveEnd?.getTime()) &&
    effectiveEnd < effectiveStart
  ) {
    return {
      ok: false,
      fieldErrors: { endDate: ["The end date must be on or after the start date."] },
    };
  }

  return { ok: true, dates };
}

/**
 * True when a date already in the database is one the UI can safely render and
 * act on. Used by the read guards (P02.02) and the repair report (P02.03).
 *
 * Deliberately tolerant of `null` for optional fields — an absent review date is
 * not damage. The run explicitly DISPROVED the theory that a null
 * `reviewDueDate` caused DEF-050: 9 of 201 contracts had one and rendered fine.
 */
export function isRenderableContractDate(value: Date | null | undefined): boolean {
  if (value == null) return true;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false;
  const year = value.getUTCFullYear();
  return year >= 1900 && year <= 9999;
}
