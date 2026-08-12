"use client";

/**
 * UAT-HF P01.01 — accessible error summary with focus management.
 *
 * The run found forms where a failed submit changed nothing a screen-reader or
 * keyboard user could perceive: X-002 s4 was Blocked because the import form
 * "produces no in-DOM error elements at all — validation is handled natively by
 * the browser and no error text is rendered into the page" (DEF-074), and
 * DEF-069 recorded browser validation text being suppressed outright.
 *
 * The fix is the standard one: on failure, move focus to a summary that names
 * every problem and links to the offending field. Focus movement is what makes
 * the failure perceivable without sight — a `role="alert"` that nobody is looking
 * at is not enough on its own.
 */
import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import type { MutationFailure } from "@/lib/mutation-contract";

export interface ErrorSummaryProps {
  failure: MutationFailure | null;
  /**
   * Field order for listing errors — usually the visual order of the form, so
   * the summary reads in the same sequence the user filled it in.
   */
  fieldOrder?: string[];
  /** Human labels; falls back to the raw field name. */
  fieldLabels?: Record<string, string>;
  /**
   * How to turn a field name into the id of its input. Defaults to the field
   * name, which matches this codebase's `id={name}` convention.
   */
  fieldElementId?: (field: string) => string;
  className?: string;
}

export function ErrorSummary({
  failure,
  fieldOrder,
  fieldLabels,
  fieldElementId = (f) => f,
  className,
}: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Re-focus on every new failure, not just the first: a second failed attempt
  // must be announced too. correlationId is fresh per attempt, so it is the
  // correct dependency.
  const correlationId = failure?.correlationId;
  useEffect(() => {
    if (correlationId) ref.current?.focus();
  }, [correlationId]);

  const fieldErrors = failure?.fieldErrors ?? {};
  const named = Object.keys(fieldErrors);

  // Division of labour with MutationOutcome, so one failure never reads as two:
  //   ErrorSummary  owns FIELD-level problems (and the whole of a VALIDATION
  //                 failure, because MutationOutcome deliberately skips that kind).
  //   MutationOutcome owns the FORM-level outcome and the support reference.
  if (!failure || (named.length === 0 && failure.kind !== "VALIDATION")) return null;
  const ordered = fieldOrder
    ? [...fieldOrder.filter((f) => named.includes(f)), ...named.filter((f) => !fieldOrder.includes(f))]
    : named;

  const label = (field: string) => fieldLabels?.[field] ?? field;

  return (
    <div
      ref={ref}
      // tabIndex -1 makes it programmatically focusable without adding a tab stop.
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-heading"
      className={
        className ??
        "rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-error"
      }
    >
      <p id="error-summary-heading" className="flex items-center gap-2 font-semibold">
        <AlertCircle size={16} aria-hidden="true" />
        {ordered.length > 0
          ? `There ${ordered.length === 1 ? "is 1 problem" : `are ${ordered.length} problems`} with this form`
          : "This could not be saved"}
      </p>

      {/* Only when no banner accompanies us — otherwise this repeats it. */}
      {failure.kind === "VALIDATION" && <p className="mt-1">{failure.message}</p>}

      {ordered.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {ordered.map((field) => (
            <li key={field}>
              <a href={`#${fieldElementId(field)}`} className="underline">
                {label(field)}: {fieldErrors[field][0]}
              </a>
            </li>
          ))}
        </ul>
      )}

      {/*
        No support reference here. Validation is the user's to fix and needs none,
        and for every other kind MutationOutcome renders the reference exactly once.
      */}
    </div>
  );
}
