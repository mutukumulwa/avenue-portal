"use client";

import { useEffect, useRef, useState } from "react";
import {
  SESSION_ABSOLUTE_MAX_AGE_S,
  expiredLoginPath,
  sessionDecision,
  sessionExpiryMessage,
} from "@/lib/session-policy";

/**
 * DEF-010 — client-side idle-session guard for protected forms.
 *
 * The idle timeout is enforced only by the JWT `exp`: an expired session
 * materialises no signal until a page or server action calls auth(). On a form
 * like Register Member that meant the browser's native `required` validation ran
 * FIRST on submit, so the user saw field bubbles (or the action silently
 * redirected to /login) instead of a clear "your session expired" message. The
 * server action still fails closed — this guard is the missing user-facing
 * signal, fired at the point of action.
 *
 * ── UAT-HF P10.04 — DEF-015, and this component was the cause ──────────────
 *
 * "After a measured 32 minutes of genuine inactivity with an enrolment form
 * open, the first protected action (loading the Member Registry) completed
 * normally in 4.1 s, still authenticated, with no reauthentication prompt."
 *
 * The register could not diagnose it from the front end and offered two
 * hypotheses: "A rolling session refreshed by background client requests would
 * explain it; so would an unenforced expiry." It was the first, and the
 * background request was **this guard's own polling**.
 *
 * It read `/api/auth/session` every 60 seconds and again on every window focus.
 * NextAuth re-issues the session cookie with a fresh `exp` on that endpoint once
 * `updateAge` (5 minutes) has elapsed, so a 60-second poll kept the rolling
 * 30-minute window permanently topped up. The guard built to notice expiry was
 * the reason expiry never arrived — and an idle admin workstation stayed signed
 * in indefinitely, in the shared front-desk setting this UAT explicitly covers.
 *
 * So the session is now read exactly ONCE, on mount. That single read is
 * user-initiated by definition — somebody navigated here — and refreshing on
 * genuine navigation is the rolling window working as intended. Everything
 * after that is computed from local clocks, and touches the network never.
 *
 * The absolute cap is enforced here too, from `authenticatedAt`. It is not
 * derivable from NextAuth's `expires`, which only ever describes the rolling
 * window.
 *
 * It remains deliberately best-effort: if the session endpoint cannot be read
 * the expiry stays unknown and the guard is inert, leaving the always-fail-closed
 * server guard as the real authority. `sessionDecision` returns UNKNOWN there,
 * and only the SERVER treats UNKNOWN as a refusal — a false client-side bounce
 * would throw away typed work to protect nothing.
 */
export function SessionExpiryGuard({ children }: { children: React.ReactNode }) {
  const deadlineRef = useRef<{ rolling: number | null; authAt: number | null }>({
    rolling: null,
    authAt: null,
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // ONE read, on mount. No interval and no focus listener: those were the
  // background requests that kept the rolling window alive forever (DEF-015).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const data = (await res.json().catch(() => null)) as
          | { expires?: string; user?: { authenticatedAt?: number } }
          | null;
        if (cancelled) return;
        const rolling = data?.expires ? Date.parse(data.expires) : NaN;
        deadlineRef.current = {
          rolling: Number.isNaN(rolling) ? null : rolling,
          authAt: typeof data?.user?.authenticatedAt === "number" ? data.user.authenticatedAt : null,
        };
      } catch {
        // Endpoint unreachable — leave expiry unknown; the guard stays inert.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Warn before expiry, on a local timer. Checking the clock costs nothing and,
  // crucially, cannot extend the session.
  useEffect(() => {
    const tick = () => {
      const decision = decide(deadlineRef.current);
      setWarning(
        decision.state === "EXPIRING_SOON" || decision.expired
          ? sessionExpiryMessage(decision)
          : null,
      );
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const submitter = target?.closest?.('button[type="submit"], input[type="submit"]');
      if (!submitter) return;
      if (decide(deadlineRef.current).expired) {
        // Cancel the submit path entirely and route to a re-login that explains
        // why. stopPropagation keeps the form's own handlers from firing too.
        // The draft (P04.02) survives in tab storage, so the work is not lost.
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
      {warning && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-lg border border-[#FFC107]/50 bg-[#FFC107]/5 px-4 py-2 text-sm text-[#856404]"
        >
          {warning}
        </p>
      )}
      {children}
    </div>
  );
}

function decide(deadlines: { rolling: number | null; authAt: number | null }) {
  // NextAuth's `expires` IS the rolling idle deadline, so it is fed in as an
  // already-computed one (idleMaxAgeS 0) rather than re-derived from an
  // activity timestamp the client does not have.
  return sessionDecision({
    lastActivityAtMs: deadlines.rolling,
    idleMaxAgeS: 0,
    authenticatedAtMs: deadlines.authAt,
    absoluteMaxAgeS: SESSION_ABSOLUTE_MAX_AGE_S,
    nowMs: Date.now(),
  });
}
