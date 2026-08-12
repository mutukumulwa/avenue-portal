"use client";

/**
 * UAT-HF P09.02 — the money and percentage inputs (DEF-018, DEF-021).
 *
 * DEF-018: 'Typing the everyday shorthand "300k" into "Overall Annual Limit
 * (UGX)" leaves the field holding "300". The input reports itself valid, the
 * browser validation message is empty, and no inline error, hint or warning is
 * shown ... The same field correctly handles "300,000" and "UGX 300000" (both
 * resolve to 300000), which makes the failure worse: the user has just been
 * trained that the field tolerates human formatting, and then one common
 * shorthand silently truncates the magnitude by a factor of 1000.'
 *
 * Two things follow from that, and only doing one of them is not a fix:
 *
 *   1. **Reject the suffix loudly.** `<input type="number">` is what silently
 *      dropped the "k" — the browser parses the leading digits and reports the
 *      field valid. So these are TEXT inputs, parsed by `parseMoney`, which
 *      names MAGNITUDE_SUFFIX as its own failure precisely because that is the
 *      mistake that actually happened.
 *   2. **Read the value back.** The user was "trained that the field tolerates
 *      human formatting" — so the field must say what it understood. A
 *      magnitude error becomes visible before it is saved, not after a benefit
 *      is capped at UGX 300.
 */

import { useId, useState } from "react";
import {
  MONEY_INPUT_HINT,
  formatMoneyReadback,
  parseMoney,
  parsePercent,
} from "@/lib/money";
import { CURRENCY_CODE } from "@/lib/locale-config";

interface MoneyFieldProps {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  required?: boolean;
  currency?: string;
  /** Server-side field error, if the form round-tripped with one. */
  error?: string;
  hint?: string;
}

const inputCls =
  "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";
const labelCls = "text-xs font-bold text-brand-text-muted uppercase block mb-1";

export function MoneyField({
  name,
  label,
  defaultValue,
  required,
  currency = CURRENCY_CODE,
  error,
  hint,
}: MoneyFieldProps) {
  const id = useId();
  const [raw, setRaw] = useState(defaultValue == null ? "" : String(defaultValue));

  const parsed = raw.trim() === "" ? null : parseMoney(raw);
  // The local parse error takes precedence: it is about what is on screen now,
  // whereas the server error describes the value that was submitted.
  const message = parsed && !parsed.ok ? parsed.message : error;
  const readback = parsed?.ok ? formatMoneyReadback(parsed.value, currency) : null;

  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label} ({currency}){required ? " *" : ""}
      </label>
      <input
        id={id}
        name={name}
        // TEXT, not number: type="number" is what silently swallowed the "k".
        type="text"
        inputMode="decimal"
        required={required}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        aria-describedby={`${id}-hint`}
        aria-invalid={message ? true : undefined}
        className={`${inputCls} ${message ? "border-[#DC3545]" : ""}`}
        placeholder="e.g. 300000"
      />
      <p id={`${id}-hint`} className="mt-1 text-[10px] text-brand-text-muted">
        {message ? (
          <span role="alert" className="font-semibold text-[#DC3545]">
            {message}
          </span>
        ) : readback ? (
          // What the system understood, in words, before anything is saved.
          <span className="font-semibold text-brand-text-heading">{readback}</span>
        ) : (
          (hint ?? MONEY_INPUT_HINT)
        )}
      </p>
    </div>
  );
}

interface PercentFieldProps {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  required?: boolean;
  error?: string;
}

/**
 * DEF-021: "The percentage input declares min='0' and max='100' and the browser
 * treats 0 as valid, but attempting to save a 0% rule is refused server-side
 * with 'Percentage is required...'. Zero is conflated with empty."
 *
 * The server check is fixed in `co-contribution.ts`; this side states the range
 * it actually accepts, and says out loud that 0 is allowed — because the run's
 * underwriter had no way to know the advertised range was not the real one.
 */
export function PercentField({ name, label, defaultValue, required, error }: PercentFieldProps) {
  const id = useId();
  const [raw, setRaw] = useState(defaultValue == null ? "" : String(defaultValue));

  const parsed = raw.trim() === "" ? null : parsePercent(raw);
  const message = parsed && !parsed.ok ? parsed.message : error;
  const readback = parsed?.ok ? `${parsed.value.toString()}%` : null;

  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label} (%){required ? " *" : ""}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        required={required}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        aria-describedby={`${id}-hint`}
        aria-invalid={message ? true : undefined}
        className={`${inputCls} ${message ? "border-[#DC3545]" : ""}`}
        placeholder="e.g. 20"
      />
      <p id={`${id}-hint`} className="mt-1 text-[10px] text-brand-text-muted">
        {message ? (
          <span role="alert" className="font-semibold text-[#DC3545]">
            {message}
          </span>
        ) : readback ? (
          <span className="font-semibold text-brand-text-heading">{readback}</span>
        ) : (
          "0 to 100. Enter 0 if the member pays nothing."
        )}
      </p>
    </div>
  );
}
