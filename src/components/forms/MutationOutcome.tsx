"use client";

/**
 * UAT-HF P01.01 — one banner that renders each mutation outcome as a *distinct*
 * state.
 *
 * DEF-070: "One generic failure screen serves every cause, with no correlation
 * reference on the client path." DEF-075: success gave no reference and no next
 * action. Both are fixed by refusing to collapse five different situations into
 * one grey box.
 *
 * The distinction that matters most is UNKNOWN_OUTCOME. Every other kind can say
 * "this did not happen". That one cannot, so it must not offer a retry button —
 * it offers a way to *check*. Presenting it like an ordinary failure is what let
 * DEF-065 hide a committed write behind a crash.
 *
 * VALIDATION is intentionally not rendered here: field-level problems belong in
 * `ErrorSummary`, next to the inputs, and duplicating them reads as two faults.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, HelpCircle, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { isDefaultMessage, type MutationResult } from "@/lib/mutation-contract";

export interface MutationOutcomeProps<T> {
  result: MutationResult<T> | null;
  /** Where to check whether the intent landed. Required to act on UNKNOWN_OUTCOME. */
  checkHref?: string;
  /** Where "next action" points on success. */
  nextHref?: string;
  /** Offered only for kinds where a retry is provably safe. */
  onRetry?: () => void;
  className?: string;
}

const SHELL = "rounded-md border px-4 py-3 text-sm";

export function MutationOutcome<T>({
  result,
  checkHref,
  nextHref,
  onRetry,
  className,
}: MutationOutcomeProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  // Take focus only when ErrorSummary is not going to: it owns focus whenever
  // there are field errors, and two components competing for it would fight.
  const focusKey = result && !result.ok && !result.fieldErrors ? result.correlationId : null;
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);

  if (!result) return null;

  if (result.ok) {
    return (
      <div role="status" className={className ?? `${SHELL} border-brand-success/30 bg-brand-success/10 text-brand-success`}>
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 size={16} aria-hidden="true" />
          {result.replayed ? "Already saved" : "Saved"}
        </p>
        <p className="mt-1">
          {result.replayed
            ? "This had already been submitted, so nothing was duplicated."
            : "Your change has been recorded."}
          {result.entityRef && (
            <>
              {" "}
              Reference <code className="font-mono font-semibold">{result.entityRef}</code>.
            </>
          )}
        </p>
        {result.nextAction && nextHref && (
          <p className="mt-2">
            <Link href={nextHref} className="font-semibold underline">
              {result.nextAction}
            </Link>
          </p>
        )}
      </div>
    );
  }

  // Field-level problems are rendered by ErrorSummary beside the inputs.
  if (result.kind === "VALIDATION") return null;

  const shared = (
    <p className="mt-2 text-xs opacity-80">
      Reference <code className="font-mono">{result.correlationId}</code> — quote this if you contact support.
    </p>
  );

  /**
   * The heading already states the situation. Echo the envelope's `message` only
   * when a caller supplied task-specific copy; otherwise say something the
   * heading does not, rather than repeating it in different words.
   */
  const body = (builtIn: string) => (isDefaultMessage(result.kind, result.message) ? builtIn : result.message);

  if (result.kind === "UNKNOWN_OUTCOME") {
    return (
      <div ref={ref} tabIndex={-1} role="alert" className={className ?? `${SHELL} border-amber-400/40 bg-amber-50 text-amber-900`}>
        <p className="flex items-center gap-2 font-semibold">
          <HelpCircle size={16} aria-hidden="true" />
          We could not confirm whether this was saved
        </p>
        <p className="mt-1">
          The connection failed before we got an answer, so this may or may not have gone through.
          <strong> Do not submit it again</strong> — that could create a duplicate. Check first.
        </p>
        {checkHref ? (
          <p className="mt-2">
            <Link href={checkHref} className="font-semibold underline">
              Check whether it was saved
            </Link>
          </p>
        ) : (
          <p className="mt-2">Open the record in a new tab to check before doing anything else.</p>
        )}
        {result.operationId && (
          <p className="mt-2 text-xs opacity-80">
            Operation <code className="font-mono">{result.operationId}</code>
          </p>
        )}
        {shared}
      </div>
    );
  }

  if (result.kind === "CONFLICT") {
    return (
      <div ref={ref} tabIndex={-1} role="alert" className={className ?? `${SHELL} border-amber-400/40 bg-amber-50 text-amber-900`}>
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} aria-hidden="true" />
          This record changed while you were working
        </p>
        <p className="mt-1">{body("Reload to see the current values, then reapply your change.")} Nothing has been saved.</p>
        {shared}
      </div>
    );
  }

  if (result.kind === "FORBIDDEN") {
    return (
      <div ref={ref} tabIndex={-1} role="alert" className={className ?? `${SHELL} border-brand-error/30 bg-brand-error/10 text-brand-error`}>
        <p className="flex items-center gap-2 font-semibold">
          <Lock size={16} aria-hidden="true" />
          You do not have permission to do this
        </p>
        <p className="mt-1">{body("Ask your administrator to check your role if you think this is wrong.")} Nothing has been saved.</p>
        {shared}
      </div>
    );
  }

  // UNAVAILABLE — the one kind where an unprompted retry is safe.
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={className ?? `${SHELL} border-brand-error/30 bg-brand-error/10 text-brand-error`}>
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} aria-hidden="true" />
        Temporarily unavailable
      </p>
      <p className="mt-1">{body("The service did not respond.")} Nothing has been saved, so it is safe to try again.</p>
      {result.retryable && onRetry && (
        <p className="mt-2">
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-semibold underline">
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      )}
      {shared}
    </div>
  );
}
