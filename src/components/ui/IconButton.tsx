"use client";

/**
 * UAT-HF P01.06 — an icon button that cannot ship without a name.
 *
 * DEF-056: package-rule controls were bare icons with no accessible name, so a
 * screen-reader user reached a button announced only as "button" — and one of
 * them deleted a rule. DEF-081 is the same failure on lifecycle micro-forms.
 *
 * `label` is required and is not optional-with-a-default, so the omission that
 * caused the defect is a type error rather than a silent regression. The label
 * is exposed as the accessible name and as the tooltip, so sighted and
 * screen-reader users get the same information.
 */
import type { ReactNode } from "react";

export interface IconButtonProps {
  /** Required. Becomes the accessible name AND the tooltip. */
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Destructive actions get error styling; they should also be confirmed. */
  tone?: "default" | "destructive";
  disabled?: boolean;
  className?: string;
}

const TONE = {
  default: "text-brand-text-muted hover:text-brand-text-heading hover:bg-brand-bg-alt",
  destructive: "text-brand-error hover:bg-brand-error/10",
} as const;

export function IconButton({
  label,
  icon,
  onClick,
  type = "button",
  tone = "default",
  disabled = false,
  className,
}: IconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // The accessible name. Without it this is announced as just "button".
      aria-label={label}
      title={label}
      className={
        className ??
        `inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${TONE[tone]} ` +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal disabled:opacity-40 disabled:cursor-not-allowed"
      }
    >
      {/* The glyph is decorative: the button already has a name. */}
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
