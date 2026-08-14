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
 * ## The unattributed events
 *
 * `AuditLog.userId` was a required foreign key until P10.08, which meant two
 * events could not be written at all — not written badly, not written
 * anonymously: absent. A sweep across addresses with no accounts, and a source
 * address hitting the rate limit, are precisely the patterns an investigation
 * looks for, and both are actor-less by nature.
 *
 * They are now written with a null actor, which is a *fact* rather than a
 * missing value. Nothing else changed: every path that HAS an actor still
 * passes one.
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
/** UAT-HF P10.07 — a source address hit the failure limit. */
export const AUTH_SIGN_IN_IP_BLOCKED = "AUTH_SIGN_IN_IP_BLOCKED";
/** UAT-HF P10.08 — an attempt against an address with no account. */
export const AUTH_SIGN_IN_UNKNOWN = "AUTH_SIGN_IN_UNKNOWN";

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
  userId: string | null,
  // Null for an event with no tenant — an address that matches no account
  // belongs to nobody. Such a row sits outside the per-tenant hash chain by
  // construction, which is a property of the event, not a defect in the write.
  tenantId: string | null,
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

/**
 * The block, as a log line as well as an audit row.
 *
 * Both, deliberately. The audit row is the record; the log line is what an
 * on-call engineer greps at 2am when a facility says nobody can sign in, and it
 * survives the database being the thing that is broken.
 */
export function reportIpBlocked(ip: string, limit: number, windowMinutes: number): void {
  console.warn(
    `[auth] AUTH_SIGN_IN_IP_BLOCKED ip=${ip} limit=${limit} windowMinutes=${windowMinutes} ` +
      `— every user behind this address is now refused until the block expires`,
  );
}

/**
 * A sign-in attempt against an address that has no account.
 *
 * The single most useful signal for credential stuffing, and until P10.08 it
 * could not be recorded: there was no user row for the foreign key to point at.
 *
 * ## The attempted address is stored only when it looks like an address
 *
 * People type their password into the email field. Storing whatever arrived
 * would put plaintext passwords into an audit table that is retained, exported
 * and read by staff — creating a credential leak while building a security
 * control. So a value that is not email-shaped is recorded by SHAPE only, never
 * by content, and the row still counts toward the pattern.
 *
 * `tenantId` is null: an address with no account belongs to no tenant. Such a
 * row therefore sits outside the tenant hash chain, which is unavoidable — the
 * chain is per-tenant and this event has no tenant. It is still in the table,
 * still queryable, and infinitely better than the nothing it replaced.
 */
export async function recordUnknownAddressSignIn(attempted: string): Promise<void> {
  const looksLikeEmail = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(attempted.trim());
  await write(
    null,
    null,
    AUTH_SIGN_IN_UNKNOWN,
    "Sign-in attempted for an address with no account",
    looksLikeEmail
      ? { attempted: attempted.trim().toLowerCase() }
      : {
          attempted: null,
          redacted: "NOT_EMAIL_SHAPED",
          length: attempted.length,
          note: "withheld — a value in the email field that is not an address is frequently a password",
        },
  );
}

/**
 * A source address hit the sign-in failure limit.
 *
 * Written once, by the failure that armed the block. Actor-less on purpose: a
 * source-level control fires ACROSS accounts, and hanging the row on whichever
 * account happened to be tried last would be a fiction that reads like a fact.
 *
 * This replaces a console line. A log line is not an audit trail — it is not
 * queryable beside the events around it, it ages out on a retention policy
 * nobody chose for this purpose, and it is invisible to the audit-log page an
 * operator actually opens when a facility reports it cannot sign in.
 */
export async function recordIpBlocked(
  ip: string,
  limit: number,
  windowMinutes: number,
): Promise<void> {
  await write(null, null, AUTH_SIGN_IN_IP_BLOCKED, "Source address blocked after repeated failed sign-ins", {
    ipAddress: ip,
    limit,
    windowMinutes,
    note: "every user behind this address is refused until the block expires",
  });
}
