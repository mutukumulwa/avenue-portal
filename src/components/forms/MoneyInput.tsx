"use client";

/**
 * Family Hospital UAT plan P03.04 / FH-10 — the controlled money input.
 *
 * The facility typed "600,000" into a pre-authorisation estimate and was told
 * "Enter a valid estimated cost.": the field was `<input type="number">`, which
 * hands the form an EMPTY value for any grouped text, and the server then read
 * `Number("")` as 0. This control is a text input parsed by the shared,
 * decimal-safe `parseMoney` grammar (which now accepts "600000", "600,000" and
 * "600 000"), so the magnitude a user types is either understood exactly or
 * refused with a reason — never silently changed.
 *
 *   - On blur a valid amount is re-shown grouped the en-UG way ("600,000").
 *   - An invalid amount is left exactly as typed, with a field-level message.
 *   - `canonicalMoney` gives the decimal text to submit; nothing calls Number().
 *
 * `MoneyField` (UAT-HF P09.02) remains the uncontrolled form-post variant; both
 * share the one parser.
 */
import { useId, useState, type Ref } from "react";
import { formatGroupedAmount, MONEY_INPUT_HINT, parseMoney, toCanonicalMoney } from "@/lib/money";
import { CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL } from "@/components/provider/capture-styles";

/** Canonical decimal text for submission, or null when the text is not a valid amount. */
export function canonicalMoney(raw: string): string | null {
  const parsed = parseMoney(raw);
  return parsed.ok && parsed.value.gt(0) ? toCanonicalMoney(parsed.value) : null;
}

export interface MoneyInputProps {
  label: string;
  /** Exactly what the user sees in the box. */
  value: string;
  onChange: (raw: string) => void;
  currency: string | null;
  required?: boolean;
  /** A server-side field error from the last submit. */
  error?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  /** Hide the visible label (a table-style row labels it another way). */
  labelHidden?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export function MoneyInput({ label, value, onChange, currency, required, error, hint, disabled, id, labelHidden, inputRef }: MoneyInputProps) {
  const autoId = useId();
  const inputId = id ?? `money-${autoId}`;
  const hintId = `${inputId}-hint`;
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const parsed = trimmed === "" ? null : parseMoney(trimmed);
  let localError: string | undefined;
  if (touched) {
    if (parsed && !parsed.ok) localError = parsed.message;
    else if (parsed?.ok && parsed.value.lte(0)) localError = "Enter an amount greater than zero.";
    else if (!parsed && required) localError = "Enter an amount.";
  }
  // What is on screen now outranks what was submitted earlier.
  const message = localError ?? error;

  return (
    <div>
      <label htmlFor={inputId} className={labelHidden ? "sr-only" : CAPTURE_LABEL}>
        {label}
        {currency ? ` (${currency})` : ""}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={message ? true : undefined}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          if (parsed?.ok && parsed.value.gt(0)) onChange(formatGroupedAmount(parsed.value));
        }}
        className={CAPTURE_INPUT}
        placeholder="e.g. 600,000"
      />
      <p id={hintId} className={message ? CAPTURE_ERROR : CAPTURE_HINT}>
        {message ? <span role="alert">{message}</span> : (hint ?? MONEY_INPUT_HINT)}
      </p>
    </div>
  );
}
