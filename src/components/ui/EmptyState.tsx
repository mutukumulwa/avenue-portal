"use client";

/**
 * UAT-HF P01.06 — an empty state that says WHY and WHAT NEXT.
 *
 * DEF-082: empty states that state only that something is empty. The run's
 * sharpest example of the cost is DEF-007 — member "Find Care" returned no
 * covered facility at any radius while 195 providers existed, and the screen
 * could not distinguish "no facility near you" from "your location is unknown"
 * from "none of these are in your network" from "the service is down".
 *
 * An empty state must therefore name three things: what is missing, WHY it is
 * missing, and the next action — including who owns that action when the reader
 * cannot perform it themselves.
 *
 * `reason` is required for exactly that purpose. "No results" is not a reason.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  /** What is not here, e.g. "No facilities in your network nearby". */
  title: string;
  /** Required. WHY it is not here — never merely restate the title. */
  reason: string;
  /** What to do next; omit only when nothing can be done. */
  action?: { label: string; href: string } | { label: string; onClick: () => void };
  /** Who to ask when the reader cannot act themselves. */
  ownerHint?: string;
  className?: string;
}

export function EmptyState({ icon, title, reason, action, ownerHint, className }: EmptyStateProps) {
  return (
    <div
      className={className ?? "flex flex-col items-center justify-center rounded-lg border border-dashed border-brand-border px-6 py-10 text-center"}
    >
      {icon && (
        <div className="mb-3 text-brand-text-muted" aria-hidden="true">
          {icon}
        </div>
      )}

      <p className="text-sm font-semibold text-brand-text-heading">{title}</p>
      <p className="mt-1 max-w-md text-sm text-brand-text-body">{reason}</p>

      {action && (
        <div className="mt-4">
          {"href" in action ? (
            <Link
              href={action.href}
              className="inline-flex items-center rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              {action.label}
            </button>
          )}
        </div>
      )}

      {ownerHint && <p className="mt-3 text-xs text-brand-text-muted">{ownerHint}</p>}
    </div>
  );
}
