"use client";

/**
 * UAT-HF P01.06 — the labelled field primitive.
 *
 * The run found forms that hand-roll their own label/hint/error wiring, and the
 * same defects therefore repeat across modules:
 *
 *   DEF-019  package builder money and age fields have NO accessible names
 *   DEF-073  controls without a computed name
 *   DEF-074  a form that "produces no in-DOM error elements at all" — validation
 *            handled natively by the browser, no error text rendered into the page
 *   DEF-020  date fields show no format hint and no timezone
 *
 * Every one of those is prevented by construction here: a `Field` cannot render
 * without a label, the control always receives an `id` matching the label's
 * `htmlFor`, and any hint or error is wired into `aria-describedby` so a screen
 * reader reads them as part of the field rather than as loose text nearby.
 *
 * Adoption is deliberately NOT part of P01.06 — later tasks migrate screens onto
 * these. This file only makes the correct thing available and cheap.
 */
import { useId, type ReactNode } from "react";

export interface FieldRenderProps {
  id: string;
  name: string;
  required: boolean;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

export interface FieldProps {
  name: string;
  /** Required. A field with no label is the defect this primitive prevents. */
  label: string;
  /** Format guidance, e.g. "DD/MM/YYYY" or the money grammar (DEF-020, DEF-018). */
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: FieldRenderProps) => ReactNode;
  className?: string;
}

export function Field({ name, label, hint, error, required = false, children, className }: FieldProps) {
  // useId keeps ids unique when the same field appears twice on a page (e.g. a
  // row editor repeated per row), which hand-rolled `id={name}` does not.
  const uid = useId();
  const id = `${name}-${uid}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Order matters: a screen reader announces the hint before the error.
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className ?? "space-y-1"}>
      <label htmlFor={id} className="text-sm font-medium text-brand-text-heading">
        {label}
        {required && (
          <>
            {" "}
            <span className="text-brand-error" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-xs text-brand-text-muted">
          {hint}
        </p>
      )}

      {children({
        id,
        name,
        required,
        "aria-invalid": !!error,
        "aria-describedby": describedBy,
      })}

      {/*
        role="alert" so a validation failure is announced when it appears, rather
        than sitting silently in the DOM (DEF-074).
      */}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-brand-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared control styling, including the always-visible focus ring (DEF-073). */
export const CONTROL_CLASS =
  "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body " +
  "focus:border-brand-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal " +
  "aria-[invalid=true]:border-brand-error";

export interface TextFieldProps extends Omit<FieldProps, "children"> {
  type?: "text" | "email" | "tel" | "date" | "password" | "search";
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/** The common case: a labelled text input wired correctly. */
export function TextField({
  type = "text",
  defaultValue,
  value,
  placeholder,
  autoComplete,
  maxLength,
  onChange,
  ...field
}: TextFieldProps) {
  return (
    <Field {...field}>
      {(props) => (
        <input
          {...props}
          type={type}
          defaultValue={defaultValue}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          onChange={onChange}
          className={CONTROL_CLASS}
        />
      )}
    </Field>
  );
}
