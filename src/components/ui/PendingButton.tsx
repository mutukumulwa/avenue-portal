"use client";

import { useFormStatus } from "react-dom";

/**
 * PR-009: standard mutating-form button — shows a pending state and disables
 * while the server action is in flight, so a double-click issues one request.
 * Drop-in replacement for a submit <button> inside a <form action={...}>.
 */
export function PendingButton({
  children,
  className,
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
