"use client";

/**
 * UAT-HF P01.04 — the shared recovery surface behind every error boundary.
 *
 * Two findings shaped this:
 *
 *   DEF-050 (S1)  one ordinary "Create draft" permanently disabled the entire
 *                 Provider Contracts module for every user — `RangeError: Invalid
 *                 time value` in both the list and detail renderers. There was no
 *                 UI recovery path at all: the bad row was reachable only through
 *                 the two crashing routes.
 *   DEF-070       "One generic failure screen serves every cause, with no
 *                 correlation reference on the client path, although server errors
 *                 carry digests."
 *
 * So this surface must do three things the old one did not: name a reference the
 * user can quote, offer a way *out* of a dead segment rather than only "try again",
 * and never show framework copy or a stack trace.
 *
 * `error.digest` is the identifier Next.js generates to match the server log. In
 * production `error.message` is deliberately generic for server errors, but for
 * client errors it is the REAL message — so it is never rendered. The digest is.
 */
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, LifeBuoy, RefreshCw } from "lucide-react";

export interface ErrorRecoveryProps {
  error: Error & { digest?: string };
  /** Re-render the boundary's contents. Safe: it retries a READ, never a write. */
  reset?: () => void;
  /** What the user was looking at, e.g. "provider contracts". */
  area?: string;
  /** Where "get me out of here" goes. */
  homeHref?: string;
  homeLabel?: string;
  /** Set on the global boundary, which cannot rely on the app shell. */
  standalone?: boolean;
}

/**
 * Send the boundary event somewhere. Console today; P12.01 replaces the sink with
 * real telemetry without touching call sites.
 */
export function reportBoundaryError(error: Error & { digest?: string }, area?: string): void {
  console.error("[error-boundary]", {
    area: area ?? "app",
    digest: error.digest,
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
}

export function ErrorRecovery({
  error,
  reset,
  area,
  homeHref = "/",
  homeLabel = "Go to dashboard",
  standalone = false,
}: ErrorRecoveryProps) {
  useEffect(() => {
    reportBoundaryError(error, area);
  }, [error, area]);

  return (
    <div
      role="alert"
      className={
        standalone
          ? "min-h-screen flex flex-col items-center justify-center px-6 text-center font-sans"
          : "min-h-[60vh] flex flex-col items-center justify-center px-6 text-center"
      }
    >
      <AlertTriangle size={48} className="mb-4 text-brand-error" aria-hidden="true" />

      <h1 className="text-2xl font-bold text-brand-text-heading font-heading">
        {area ? `Something went wrong loading ${area}` : "Something went wrong"}
      </h1>

      <p className="mt-2 max-w-md text-brand-text-body">
        This page could not be displayed. Nothing you were doing has been saved or changed.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Try again
          </button>
        )}
        {/*
          The way out. DEF-050's module was unusable precisely because every route
          into it crashed and nothing offered an exit.
        */}
        <Link
          href={homeHref}
          className="inline-flex items-center gap-2 rounded-full border border-brand-border px-6 py-2 text-sm font-semibold text-brand-text-heading transition-colors hover:bg-brand-bg-alt"
        >
          <Home size={16} aria-hidden="true" />
          {homeLabel}
        </Link>
      </div>

      {/*
        The quotable reference DEF-070 said was missing on the client path. Only
        the digest — never error.message, which for a client error is the real
        exception text, and never a stack.
      */}
      {error.digest ? (
        <p className="mt-6 text-xs text-brand-text-muted">
          Reference <code className="font-mono">{error.digest}</code> — quote this to support.
        </p>
      ) : (
        <p className="mt-6 text-xs text-brand-text-muted">
          If this keeps happening, tell support what you were doing just before it.
        </p>
      )}

      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-text-muted">
        <LifeBuoy size={13} aria-hidden="true" />
        Contact your Medvex administrator if you need this urgently.
      </p>
    </div>
  );
}
