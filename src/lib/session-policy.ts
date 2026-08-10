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
