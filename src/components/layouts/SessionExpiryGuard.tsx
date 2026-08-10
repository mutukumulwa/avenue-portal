"use client";

import { useEffect, useRef } from "react";
import { sessionIsExpired, expiredLoginPath } from "@/lib/session-policy";

/**
 * DEF-010 — client-side idle-session guard for protected forms.
 *
 * The idle timeout is enforced only by the JWT `exp` today (session-policy.ts):
 * an expired session materialises no signal until a page or server action calls
 * auth(). On a form like Register Member that meant the browser's native
 * `required` validation ran FIRST on submit, so the user saw field bubbles (or
 * the action silently redirected to /login) instead of a clear "your session
 * expired" message. The server action still fails closed — this guard is the
 * missing user-facing signal, fired at the point of action.
 *
 * Mechanics: a capture-phase `click` listener on the wrapper runs BEFORE the
 * browser's constraint validation (which happens between the button click and
 * the submit event). If the tracked session has expired, it cancels the click —
 * so no validation, no submit, no half-typed data posted at a dead session — and
 * bounces to /login?reason=expired. The wrapper uses `display: contents` so it
 * adds no box and cannot disturb the wrapped form's layout.
 *
 * It is deliberately best-effort: if the session endpoint cannot be read the
 * expiry stays unknown and the guard is inert, leaving the always-fail-closed
 * server guard as the real authority (nav visibility is convenience, not
 * security — the same principle applies here).
 */
export function SessionExpiryGuard({ children }: { children: React.ReactNode }) {
  const expiresAtRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Track the session's absolute expiry from NextAuth's own session endpoint,
  // refreshing so the rolling 30-minute window stays current across activity.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const data = (await res.json().catch(() => null)) as { expires?: string } | null;
        const parsed = data?.expires ? Date.parse(data.expires) : NaN;
        if (!cancelled) expiresAtRef.current = Number.isNaN(parsed) ? null : parsed;
      } catch {
        // Endpoint unreachable — leave expiry unknown; the guard stays inert.
      }
    };
    void load();
    const interval = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const submitter = target?.closest?.('button[type="submit"], input[type="submit"]');
      if (!submitter) return;
      if (sessionIsExpired(expiresAtRef.current, Date.now())) {
        // Cancel the submit path entirely and route to a re-login that explains
        // why. stopPropagation keeps the form's own handlers from firing too.
        e.preventDefault();
        e.stopPropagation();
        const here = typeof window !== "undefined" ? window.location.pathname : undefined;
        window.location.assign(expiredLoginPath(here));
      }
    };
    el.addEventListener("click", onClickCapture, true);
    return () => el.removeEventListener("click", onClickCapture, true);
  }, []);

  return (
    <div ref={wrapRef} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
