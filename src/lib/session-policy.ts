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
