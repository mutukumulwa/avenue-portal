/**
 * Idle-session timeout policy (UAT report §4.1, A-008 / decision D-19).
 *
 * These live in their own module (not inline in src/lib/auth.ts) so the oracle
 * values can be unit-tested: auth.ts imports next-auth, which pulls next/server
 * and cannot load under vitest. src/lib/auth.ts imports these and feeds them to
 * the NextAuth `session` config. Changing them changes the deployed JWT `exp`.
 */

/** 30-minute rolling idle expiry — the JWT `exp` sits this far ahead. */
export const SESSION_IDLE_MAX_AGE_S = 30 * 60; // 1800

/** Refresh the rolling expiry on activity at most this often. */
export const SESSION_UPDATE_AGE_S = 5 * 60; // 300

/**
 * DEF-010 — the query reason a client session-expiry check (and, ideally, any
 * future middleware) stamps on the /login redirect so the sign-in page can
 * explain the idle timeout instead of appearing for no reason.
 *
 * A single named constant keeps the producer (SessionExpiryGuard), the consumer
 * (/login banner) and the tests from drifting on a magic string.
 */
export const SESSION_EXPIRED_REASON = "expired";

/**
 * Pure predicate: is a session whose absolute expiry is `expiresAtMs` already
 * expired at `nowMs`? Null/undefined/NaN expiry ⇒ unknown ⇒ NOT expired, so the
 * client guard stays inert when it cannot read the expiry and lets the
 * server-side guard (which always fails closed) remain the real control.
 */
export function sessionIsExpired(
  expiresAtMs: number | null | undefined,
  nowMs: number,
): boolean {
  return typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) && nowMs >= expiresAtMs;
}

/**
 * The /login path a client expiry bounce should navigate to: always carries the
 * reason, and preserves where the user was via callbackUrl when it is a safe
 * in-app path (so a re-login can return them).
 */
export function expiredLoginPath(callbackUrl?: string | null): string {
  const base = `/login?reason=${SESSION_EXPIRED_REASON}`;
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.startsWith("/login")) {
    return `${base}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
  return base;
}

/**
 * UAT-HF P10.04 — the absolute session lifetime (DEF-015).
 *
 * The idle window above is ROLLING: genuine activity extends it, which is
 * correct and is what an operator working a shift needs. What it cannot do is
 * bound how long a session may live in total. Twelve hours covers the longest
 * plausible shift with margin and still guarantees that a session opened on a
 * shared front-desk machine is dead by the next morning — the setting the run
 * calls out as explicitly in scope (DEV-SHARED).
 *
 * NOTHING extends this. It is measured from authentication, not from activity.
 */
export const SESSION_ABSOLUTE_MAX_AGE_S = 12 * 60 * 60; // 43200

/** How long before expiry the user should be warned. */
export const SESSION_WARN_BEFORE_S = 2 * 60; // 120

export type SessionState =
  /** Live, and not close to either limit. */
  | "ACTIVE"
  /** Live, but expiring soon — warn without interrupting. */
  | "EXPIRING_SOON"
  /** Past the idle window: no meaningful activity for long enough. */
  | "IDLE_EXPIRED"
  /** Past the absolute cap, however active the user has been. */
  | "ABSOLUTE_EXPIRED"
  /**
   * We cannot establish the session's age.
   *
   * Callers decide what that means, and they decide DIFFERENTLY: the client
   * guard treats it as live (it is a convenience, and a false bounce loses
   * typed work), while a privileged server write must treat it as expired. The
   * asymmetry is the point — see `mayPerformPrivilegedWrite`.
   */
  | "UNKNOWN";

export interface SessionTiming {
  /** When this session was authenticated. Never moves. */
  authenticatedAtMs?: number | null;
  /** When the user last did something meaningful. Background polling is not. */
  lastActivityAtMs?: number | null;
  nowMs: number;
  idleMaxAgeS?: number;
  absoluteMaxAgeS?: number;
  warnBeforeS?: number;
}

export interface SessionDecision {
  state: SessionState;
  /** Milliseconds until the earlier of the two limits; null when unknown. */
  msRemaining: number | null;
  /** True for any state in which a protected action must be refused. */
  expired: boolean;
  /** Which limit is the binding one, for the message. */
  limit: "idle" | "absolute" | null;
}

/**
 * Decide a session's state from its two clocks.
 *
 * Pure, so the policy can be tested with a fake clock — the acceptance asks for
 * exactly that: "fake-clock test expires at policy threshold with no user
 * activity; polling cannot extend it".
 *
 * The absolute cap is evaluated FIRST. A session that is both idle-expired and
 * past its absolute limit is reported as absolute, because that is the one the
 * user cannot fix by being more active.
 */
export function sessionDecision(timing: SessionTiming): SessionDecision {
  const idleMaxMs = (timing.idleMaxAgeS ?? SESSION_IDLE_MAX_AGE_S) * 1000;
  const absoluteMaxMs = (timing.absoluteMaxAgeS ?? SESSION_ABSOLUTE_MAX_AGE_S) * 1000;
  const warnMs = (timing.warnBeforeS ?? SESSION_WARN_BEFORE_S) * 1000;

  const authAt = finite(timing.authenticatedAtMs);
  const activeAt = finite(timing.lastActivityAtMs);

  if (authAt === null && activeAt === null) {
    return { state: "UNKNOWN", msRemaining: null, expired: false, limit: null };
  }

  const absoluteDeadline = authAt === null ? null : authAt + absoluteMaxMs;
  const idleDeadline = activeAt === null ? null : activeAt + idleMaxMs;

  if (absoluteDeadline !== null && timing.nowMs >= absoluteDeadline) {
    return { state: "ABSOLUTE_EXPIRED", msRemaining: 0, expired: true, limit: "absolute" };
  }
  if (idleDeadline !== null && timing.nowMs >= idleDeadline) {
    return { state: "IDLE_EXPIRED", msRemaining: 0, expired: true, limit: "idle" };
  }

  const deadlines = [absoluteDeadline, idleDeadline].filter((d): d is number => d !== null);
  const deadline = Math.min(...deadlines);
  const msRemaining = deadline - timing.nowMs;
  const limit = deadline === absoluteDeadline ? "absolute" : "idle";

  return {
    state: msRemaining <= warnMs ? "EXPIRING_SOON" : "ACTIVE",
    msRemaining,
    expired: false,
    limit,
  };
}

/**
 * Whether a privileged write may proceed.
 *
 * Fails CLOSED on `UNKNOWN`, which the client guard deliberately does not. The
 * acceptance requires it: "fail closed if authoritative session state cannot be
 * verified for privileged write". A read we cannot vouch for is an
 * inconvenience; a write we cannot vouch for is a write by nobody in
 * particular.
 */
export function mayPerformPrivilegedWrite(decision: SessionDecision): boolean {
  return decision.state === "ACTIVE" || decision.state === "EXPIRING_SOON";
}

/** What to tell the user, in terms of what they can do about it. */
export function sessionExpiryMessage(decision: SessionDecision): string {
  switch (decision.state) {
    case "ABSOLUTE_EXPIRED":
      return "Your session reached its maximum length and has ended. Sign in again to continue — anything you had typed is still on this device.";
    case "IDLE_EXPIRED":
      return "You were signed out after a period of inactivity. Sign in again to continue — anything you had typed is still on this device.";
    case "EXPIRING_SOON":
      return decision.limit === "absolute"
        ? "Your session reaches its maximum length shortly and will end. Save your work now."
        : "You will be signed out shortly unless you continue working. Save your work now.";
    case "UNKNOWN":
      return "Your session could not be verified. Sign in again before making changes.";
    default:
      return "";
  }
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
