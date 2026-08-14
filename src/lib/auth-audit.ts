import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { LOCK_DURATION_MS } from "@/lib/session-policy";

/**
 * UAT-HF P10.05 — a failed sign-in leaves a record.
 *
 * Before this, the audit log held one row per *lock* (every fifth failure) and
 * nothing else. So the log could say "this account locked at 14:32" and could
 * not say whether that was one person fat-fingering a new password five times
 * or a list being worked through. The four failures that did not arm a lock
 * left no trace at all, and neither did any attempt made *during* a lock — the
 * period when an attack is loudest.
 *
 * That gap closed on a live account is unrecoverable: an operator resetting the
 * password (the first thing anyone does when a user reports a suspicious
 * sign-in) clears `failedLoginCount` and `lastFailedLoginAt` in the same write,
 * because those are throttle state. With this rail the history lives in the
 * audit log instead, where the reset cannot reach it.
 *
 * ## D-13 is not weakened
 *
 * D-13 governs what the *response* reveals: every failure returns the same
 * generic rejection. This writes to an internal, tenant-scoped, hash-chained
 * table that the person signing in never sees. Recording what happened and
 * refusing to disclose it are different controls.
 *
 * ## What cannot be recorded, and why
 *
 * `AuditLog.userId` is a required foreign key to `User`. An attempt against an
 * address with no account therefore **cannot** be written here — there is no
 * row to point at. That is a real gap: a credential-stuffing sweep across
 * addresses that do not exist is exactly the pattern this would otherwise
 * catch. Closing it needs either a nullable `userId` (which every reader of
 * this table currently assumes is present) or a separate store keyed by
 * address and source IP. Both are decisions, not refactors, so the gap is
 * stated here rather than silently absorbed.
 *
 * ## Volume is bounded on every path
 *
 * A row per attempt is only safe where the attempt count is itself bounded.
 * Counted failures are — five per window, then the account locks. The other
 * two paths are not: an attacker can hammer a locked or deactivated account
 * indefinitely, and one row per attempt would let them grow the audit table at
 * will. Those record **once per window** instead, guarded by a lookback.
 */

/** Why a sign-in failed. Recorded verbatim in the audit row's metadata. */
export type SignInFailureReason =
  /** Password did not match. */
  | "BAD_PASSWORD"
  /**
   * Password was correct; the authenticator code was missing, wrong, expired,
   * or already spent.
   *
   * Operationally the most important value in this union: it means somebody
   * holds a valid password for this account. Every other reason is consistent
   * with a user mistyping. This one is not, and a run of them is an incident
   * whether or not a lock ever armed.
   */
  | "BAD_TOTP";

export const AUTH_SIGN_IN_FAILED = "AUTH_SIGN_IN_FAILED";
export const AUTH_SIGN_IN_BLOCKED = "AUTH_SIGN_IN_BLOCKED";
export const AUTH_SIGN_IN_INACTIVE = "AUTH_SIGN_IN_INACTIVE";

/**
 * Written directly rather than through `writeAudit()`.
 *
 * `writeAudit()` calls `next/headers`, whose context is unreliable inside
 * `authorize()`, and it cannot carry `tenantId` — so its rows land outside the
 * tenant hash chain and are invisible to tenant-scoped audit review. That was
 * DEF-005/WP-3.1. Auth events write the row themselves, with the tenant.
 *
 * Never allowed to throw: an audit failure must not convert a wrong password
 * into a 500, nor — far worse — into a successful sign-in.
 */
async function write(
  userId: string,
  tenantId: string,
  action: string,
  description: string,
  // Prisma's own JSON input type, not Record<string, unknown>: the latter
  // permits values (undefined, functions) that cannot be serialised into a Json
  // column, and the compiler is right to reject it.
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  // try/catch, NOT `.catch()`. A rejected promise is only one of the two ways
  // this fails: if `prisma.auditLog` is undefined the property access throws
  // SYNCHRONOUSLY, before any promise exists, and `.catch()` never runs. That
  // is not hypothetical — it is how the first run of this code escaped as an
  // exception out of evaluateSignInStep, which would have turned a rejected
  // sign-in into a 500. The contract above is absolute, so the guard has to be.
  try {
    await prisma.auditLog.create({
      data: { userId, tenantId, action, module: "AUTH", description, metadata },
    });
  } catch {
    // Deliberately silent. Nothing an auth caller can do about it, and throwing
    // is the one outcome that must not happen.
  }
}

/**
 * Has a row of this kind already been written for this user since `since`?
 *
 * Deliberately not transactional. Two simultaneous attempts can both pass this
 * check and write two rows; the guard exists to bound growth against *attack
 * volume*, not to guarantee exactly one row. A duplicate under genuine
 * concurrency is harmless. Serialising the auth path to prevent it would not
 * be.
 */
async function recordedSince(userId: string, action: string, since: Date): Promise<boolean> {
  try {
    const row = await prisma.auditLog.findFirst({
      where: { userId, action, createdAt: { gte: since } },
      select: { id: true },
    });
    return row !== null;
  } catch {
    // If the lookback fails, record the event. An extra row is a smaller
    // problem than a silently missing one.
    return false;
  }
}

/**
 * A counted failure against a live, unlocked account.
 *
 * One row per attempt, which the throttle bounds to `MAX_FAILED_ATTEMPTS` per
 * window. `attemptsInWindow` is the streak this attempt produced, so a reader
 * can see 1-2-3-4-5 without joining rows, and `lockArmed` marks the attempt
 * that tipped it.
 */
export async function recordFailedSignIn(args: {
  userId: string;
  tenantId: string;
  reason: SignInFailureReason;
  /** null when the counter statement failed; the streak is then unknown. */
  attemptsInWindow: number | null;
  lockArmed: boolean;
}): Promise<void> {
  const { userId, tenantId, reason, attemptsInWindow, lockArmed } = args;
  await write(
    userId,
    tenantId,
    AUTH_SIGN_IN_FAILED,
    reason === "BAD_TOTP"
      ? "Failed sign-in: correct password, authenticator code not accepted"
      : "Failed sign-in: password not accepted",
    { reason, attemptsInWindow, lockArmed },
  );
}

/**
 * An attempt made while the account is locked.
 *
 * Recorded once per lock: the lookback starts at the moment the lock armed
 * (`lockedUntil` minus the lock duration), so a second lock produces a second
 * row and hammering one lock does not.
 *
 * Worth its own action rather than folding into `AUTH_SIGN_IN_FAILED`: these
 * attempts are *not* counted by the throttle — deliberately, since counting
 * them would let an attacker extend a victim's lock for ever — so without this
 * they are invisible everywhere. "The attempts continued through the lock" is
 * the difference between a forgetful user and someone working a list.
 */
export async function recordBlockedSignIn(args: {
  userId: string;
  tenantId: string;
  lockedUntil: Date;
}): Promise<void> {
  const { userId, tenantId, lockedUntil } = args;
  const lockArmedAt = new Date(lockedUntil.getTime() - LOCK_DURATION_MS);
  if (await recordedSince(userId, AUTH_SIGN_IN_BLOCKED, lockArmedAt)) return;
  await write(
    userId,
    tenantId,
    AUTH_SIGN_IN_BLOCKED,
    "Sign-in attempted while the account was locked",
    { lockedUntil: lockedUntil.toISOString(), note: "recorded once per lock" },
  );
}

/**
 * An attempt against an account that exists but is deactivated.
 *
 * The credential lookup filters on `isActive`, so this is indistinguishable
 * from an unknown address at the point of rejection — and it is the more
 * interesting of the two. Somebody is trying to sign in as a person who has
 * been switched off, most often a departure.
 *
 * No lock can ever arm here (the throttle is never reached), so growth is
 * bounded by window instead: one row per lock duration.
 */
export async function recordInactiveAccountSignIn(args: {
  userId: string;
  tenantId: string;
}): Promise<void> {
  const { userId, tenantId } = args;
  const since = new Date(Date.now() - LOCK_DURATION_MS);
  if (await recordedSince(userId, AUTH_SIGN_IN_INACTIVE, since)) return;
  await write(
    userId,
    tenantId,
    AUTH_SIGN_IN_INACTIVE,
    "Sign-in attempted against a deactivated account",
    { note: "recorded at most once per lock window" },
  );
}

/**
 * Resolve a rejected address to a deactivated account, for audit only.
 *
 * Runs strictly on the already-failed path and returns nothing the caller can
 * authenticate with. Kept separate from the credential lookup so the
 * authentication decision is untouched by it: a deactivated user must never
 * sign in, and the way to guarantee that is never to load them into the path
 * that could.
 */
export async function findDeactivatedAccount(
  email: string,
): Promise<{ id: string; tenantId: string } | null> {
  try {
    return await prisma.user.findFirst({
      where: { email, isActive: false },
      select: { id: true, tenantId: true },
    });
  } catch {
    return null;
  }
}
