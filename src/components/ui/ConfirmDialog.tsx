"use client";

/**
 * UAT-HF P01.06 — the confirmation dialog for consequential actions.
 *
 * DEF-040 (S2) is why this exists, in the run's own words: "Standard Cancel"
 * terminated a member on ONE unconfirmed click — "no confirmation, no last-covered/
 * effective date prompt, no reason field, and it computes a refund unprompted:
 * 'Standard cancellation · Effective 12/08/2026 · Refund: UGX 1,196,212.33'". It
 * was discovered because it fired while the tester was trying to READ its copy
 * before entering a date, which is exactly the mis-click the scenario tests for.
 *
 * DEF-025 is the same shape on package archive; DEF-081 on lifecycle micro-forms.
 *
 * So this dialog:
 *   * names the object, the consequence and the effective date BEFORE confirming;
 *   * can require the user to TYPE a phrase, so a consequential action cannot be
 *     completed by muscle memory;
 *   * makes Cancel the safe default and never makes Confirm the implicit Enter
 *     target — the P07.03 requirement that "Enter in a reason/date field cannot
 *     trigger the transition";
 *   * traps focus while open and restores it to the trigger on close.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  /** What is being acted on, e.g. "UX26-2026-00017 — Amina Nabirye Kato". */
  objectLabel: string;
  title: string;
  /** What will happen. Spell out money and dates; do not summarise them away. */
  consequences: ReactNode;
  confirmLabel: string;
  /**
   * When set, the user must type this exactly to enable confirmation. Use the
   * object's reference for anything irreversible.
   */
  requiredPhrase?: string;
  tone?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra inputs (reason code, effective date). Enter here must NOT confirm. */
  children?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  objectLabel,
  title,
  consequences,
  confirmLabel,
  requiredPhrase,
  tone = "destructive",
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [typed, setTyped] = useState("");

  // Reset the typed phrase whenever the dialog opens, so a previous attempt
  // cannot leave it pre-satisfied.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setTyped("");
  }

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the dialog itself, not the confirm button: landing on Confirm is how
    // a stray Enter becomes an unintended termination.
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const satisfied = !requiredPhrase || typed.trim() === requiredPhrase;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel(); // Cancel is always the safe default.
      return;
    }
    if (event.key !== "Tab") return;
    // Trap focus inside the dialog.
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-consequences"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-lg rounded-lg border border-brand-border bg-brand-bg p-6 shadow-lg focus:outline-none"
      >
        <h2 id="confirm-dialog-title" className="flex items-center gap-2 text-lg font-bold text-brand-text-heading">
          {tone === "destructive" && <AlertTriangle size={18} className="text-brand-error" aria-hidden="true" />}
          {title}
        </h2>

        <p className="mt-1 text-sm font-semibold text-brand-text-heading">{objectLabel}</p>

        <div id="confirm-dialog-consequences" className="mt-3 space-y-2 text-sm text-brand-text-body">
          {consequences}
        </div>

        {children && <div className="mt-4 space-y-3">{children}</div>}

        {requiredPhrase && (
          <div className="mt-4 space-y-1">
            <label htmlFor="confirm-phrase" className="text-sm font-medium text-brand-text-heading">
              Type <code className="font-mono font-semibold">{requiredPhrase}</code> to confirm
            </label>
            <input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          {/* Cancel first in DOM order, so it is the first thing Tab reaches. */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-brand-border px-5 py-2 text-sm font-semibold text-brand-text-heading focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!satisfied}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal disabled:cursor-not-allowed disabled:opacity-40 ${
              tone === "destructive" ? "bg-brand-error" : "bg-brand-indigo"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
