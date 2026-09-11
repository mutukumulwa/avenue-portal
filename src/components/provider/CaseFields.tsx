"use client";

/**
 * Family Hospital UAT plan P03.05 — the shared provider date, benefit and
 * service-type fields.
 *
 * Date: the default and the `max` are the Kampala operating date computed ON
 * THE SERVER (`operatingTodayISO()`) and passed in. The old forms computed
 * `new Date().toISOString().split("T")[0]` in the browser — the UTC date —
 * which between 00:00 and 03:00 in Kampala is still yesterday (and the
 * eligibility form showed no date at all, FH-09).
 *
 * Benefit: ONE list for every provider form (FH-12), from
 * src/lib/provider-benefit-options.ts.
 */
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { PROVIDER_BENEFIT_OPTIONS, PROVIDER_SERVICE_TYPE_OPTIONS } from "@/lib/provider-benefit-options";
import { CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL } from "./capture-styles";

function describedBy(id: string, hint?: string, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function ServiceDateField({
  id,
  label = "Date of service",
  value,
  onChange,
  max,
  error,
  hint,
  required = true,
  disabled,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Kampala today (YYYY-MM-DD), from the server — for a service already given.
   * Omitted for a pre-authorisation, whose expected date may be planned ahead.
   */
  max?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const shownHint = hint ?? "Kampala date. Today is filled in; change it if the service was on another day.";
  return (
    <div>
      <label htmlFor={id} className={CAPTURE_LABEL}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, shownHint, error)}
        onChange={(e) => onChange(e.target.value)}
        className={CAPTURE_INPUT}
      />
      <p id={`${id}-hint`} className={CAPTURE_HINT}>{shownHint}</p>
      {error ? (
        <p id={`${id}-error`} className={CAPTURE_ERROR} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BenefitSelect({
  id,
  label = "Benefit",
  value,
  onChange,
  error,
  allowAny = false,
  disabled,
}: {
  id: string;
  label?: string;
  value: BenefitCategory | "";
  onChange: (value: BenefitCategory | "") => void;
  error?: string;
  /** Eligibility may ask about cover in general ("Any"). */
  allowAny?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={CAPTURE_LABEL}>
        {label}
        {allowAny ? null : <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value as BenefitCategory | "")}
        className={CAPTURE_INPUT}
      >
        {allowAny ? <option value="">Any</option> : null}
        {PROVIDER_BENEFIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className={CAPTURE_ERROR} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ServiceTypeSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: ServiceType;
  onChange: (value: ServiceType) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={CAPTURE_LABEL}>
        Service type<span aria-hidden="true"> *</span>
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as ServiceType)} className={CAPTURE_INPUT}>
        {PROVIDER_SERVICE_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
