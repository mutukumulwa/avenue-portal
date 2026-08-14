import type { User } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { measureAsync } from "@/lib/perf";
import { consumeTotpCounter, verifyTotpCounter, totpEnrolmentRequiredNow } from "@/lib/totp";
import { LOCK_DURATION_MS as LOCK_MS, ATTEMPT_WINDOW_MS as WINDOW_MS } from "@/lib/session-policy";
import { effectivePermissions } from "@/lib/authz/catalog";
import {
  reportIpBlocked,
  recordFailedSignIn,
  recordBlockedSignIn,
  recordInactiveAccountSignIn,
  findDeactivatedAccount,
  type SignInFailureReason,
} from "@/lib/auth-audit";
import {
  rateLimitKey,
  checkIpGate,
  registerIpFailure,
  IP_FAILURE_LIMIT,
  IP_WINDOW_MS,
} from "@/server/services/sign-in-rate-limit.service";

/**
 * Credential authorization for the NextAuth CredentialsProvider, extracted out
 * of src/lib/auth.ts so it can be unit-tested without importing the whole
 * next-auth machinery (which pulls next/server and cannot load under vitest).
 * src/lib/auth.ts wires this into the provider unchanged.
 *
 * DEF-002 — database-backed brute-force throttling & temporary lockout. The
 * counter/lock live on the User row, so the control is consistent across every
 * serverless instance (AC 5). The lock is temporary and self-expiring (D-10/
 * D-14): an attacker can deny a victim for at most the lock window per burst.
 */
export const MAX_FAILED_ATTEMPTS = 5; // D-8
// D-10. Defined in session-policy.ts, which is client-safe: the sign-in page
// renders the cooldown and must not import this module (it pulls in Prisma and
// bcrypt). Re-exported here so existing callers and tests are unchanged.
export {
  LOCK_DURATION_MS,
  SIGN_IN_RECOVERY_GUIDANCE,
  // D-9. Defined in session-policy.ts so the per-IP throttle can use it without
  // importing this module, which imports the throttle.
  ATTEMPT_WINDOW_MS,
} from "@/lib/session-policy";

/**
 * A bcrypt hash of 32 random bytes that were then discarded, at the SAME cost
 * factor as a real user password.
 *
 * Compared against on every path that rejects before reaching a real hash, so
 * that "no such account" and "account locked" cost what "wrong password" costs.
 * Without it, a rejection returns in microseconds while a real account spends
 * ~100 ms in bcrypt — a channel that answers "does this address have an account
 * here" without a single distinguishable response body.
 *
 * The cost factor is the whole point and is easy to get wrong. `auth-challenge`
 * carried a cost-**10** equaliser while the application hashes passwords at 12:
 * roughly a quarter of the work, so it narrowed the gap without closing it and
 * looked finished. `tests/lib/auth-timing.test.ts` pins this to
 * PASSWORD_BCRYPT_COST so the two cannot drift apart again.
 *
 * Exported so there is exactly one of these. Two copies of a security constant
 * is two chances to hardcode the wrong cost.
 */
export const TIMING_EQUALISER_HASH =
  "$2a$12$1.GO7txLRXiqCB5TSd.1x..qqq/suEcfsU5cjdHU7xBRcohXq.79m";

/**
 * Spend the same time a real password comparison would, and discard the result.
 *
 * Deliberately spends CPU on a request that is already going to fail. An
 * attacker can force this anyway by submitting any address that has no account,
 * so declining to spend it on a locked account buys no protection — it only
 * makes locked accounts identifiable by how fast they are refused.
 */
export async function equaliseRejectionTiming(password: string): Promise<void> {
  try {
    await bcrypt.compare(password, TIMING_EQUALISER_HASH);
  } catch {
    // A malformed input must not turn a rejection into an error; the compare
    // exists only for its duration.
  }
}

/**
 * Effective permission codes for a user (WP-2, decision D2-b).
 *
 * Enum-role baseline from the canonical catalog UNION the dynamic
 * UserRoleAssignment overlay. The overlay is strictly additive.
 *
 * The union matters operationally: production has zero Role/Permission/
 * UserRoleAssignment rows, so a dynamic-only read returns [] for every user and
 * every permission-gated surface fails closed. Deriving the baseline from the
 * role keeps enforcement correct before the RBAC data seed lands, and keeps it
 * correct afterwards without a second source of truth.
 */
export async function loadUserPermissions(
  userId: string,
  tenantId: string,
  role: string,
): Promise<string[]> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId, tenantId, isActive: true, status: "ACTIVE" },
    include: {
      role: {
        include: { permissions: { include: { permission: { select: { code: true } } } } },
      },
    },
  });
  const dynamic = new Set<string>();
  for (const a of assignments) {
    for (const rp of a.role.permissions) dynamic.add(rp.permission.code);
  }
  return effectivePermissions(role, [...dynamic]);
}

type CredentialInput =
  | Partial<Record<"email" | "password" | "totp", unknown>>
  | undefined
  | null;


/**
 * UAT-HF P10.02 / P10.01 — the atomic failed-attempt counter, extracted.
 *
 * It was inline in `authorizeCredentials`. P10.01's password step needs the
 * identical behaviour, and a second copy of a lockout counter is a second
 * chance to get the rolling window or the UTC clock wrong — both of which this
 * block was written to fix. One implementation, two callers.
 */
export async function registerFailedAttempt(
  userId: string,
  tenantId: string,
  // UAT-HF P10.05. Defaulted so the two existing call sites keep compiling if
  // one is ever missed — but both pass it, and BAD_TOTP is the value worth
  // having: a correct password with a rejected code means somebody holds the
  // password. Defaulting to BAD_PASSWORD is the safe direction to be wrong in
  // (it under-claims rather than manufacturing an incident).
  reason: SignInFailureReason = "BAD_PASSWORD",
): Promise<void> {
    // UAT-HF P10.02 / DEC-11 — "Attempt counters use atomic updates so parallel
    // bad attempts cannot lose increments."
    //
    // This was read-then-write: `user.failedLoginCount` came from a findFirst
    // several awaits earlier (a bcrypt compare sits between), so N parallel
    // wrong passwords all read the same count and all wrote the same value.
    // Five simultaneous guesses counted as one, and the lock never armed —
    // which is precisely the throttle an attacker would parallelise past.
    //
    // One statement, evaluated in the database, preserving the D-9 rolling
    // window: a stale last-failure restarts the count at 1 rather than
    // extending an old streak.
    const windowStart = new Date(Date.now() - WINDOW_MS);
    const lockUntil = new Date(Date.now() + LOCK_MS);
    let locking = false;
    // null means the counter statement itself failed. The attempt is still
    // recorded — losing the audit row because the throttle had a bad moment
    // would defeat the purpose — but the streak length is then unknown, and
    // says so rather than reporting a fabricated number.
    let attemptsInWindow: number | null = null;
    try {
      const rows = await prisma.$queryRaw<{ failedLoginCount: number; locked: boolean }[]>`
        UPDATE "User"
           SET "failedLoginCount" = CASE
                 WHEN "lastFailedLoginAt" IS NOT NULL AND "lastFailedLoginAt" > ${windowStart}
                   THEN CASE WHEN "failedLoginCount" + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE "failedLoginCount" + 1 END
                 ELSE CASE WHEN 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE 1 END
               END,
               -- UTC, never CURRENT_TIMESTAMP. These are timestamp-without-
               -- time-zone columns holding UTC (what Prisma writes), while
               -- CURRENT_TIMESTAMP returns the server's LOCAL time. Measured
               -- on a +03 host, that made a freshly applied lock read as
               -- already expired: a three-hour hole in the throttle.
               "lastFailedLoginAt" = (now() AT TIME ZONE 'UTC'),
               "lockedUntil" = CASE
                 WHEN (CASE
                         WHEN "lastFailedLoginAt" IS NOT NULL AND "lastFailedLoginAt" > ${windowStart}
                           THEN "failedLoginCount" + 1
                         ELSE 1
                       END) >= ${MAX_FAILED_ATTEMPTS}
                   THEN ${lockUntil}
                 ELSE "lockedUntil"
               END
         WHERE "id" = ${userId}
        RETURNING "failedLoginCount", ("lockedUntil" IS NOT NULL AND "lockedUntil" > (now() AT TIME ZONE 'UTC')) AS locked
      `;
      // The row that actually armed the lock is the one that reports it, so
      // exactly one audit entry is written however many attempts raced.
      locking = rows[0]?.locked === true && rows[0]?.failedLoginCount === 0;
      // The statement wraps the counter to 0 on the attempt that arms the lock,
      // so the raw column under-reports by exactly that case.
      if (rows[0]) attemptsInWindow = locking ? MAX_FAILED_ATTEMPTS : rows[0].failedLoginCount;
    } catch {
      // Throttling is best-effort-hardened: a transient DB error on the counter
      // must never turn a normal wrong-password into a 500.
    }

    // UAT-HF P10.05 — every counted failure leaves a row, not just the fifth.
    // Written before the lock event so a reader sees the attempt that armed the
    // lock immediately preceding the lock itself.
    await recordFailedSignIn({ userId, tenantId, reason, attemptsInWindow, lockArmed: locking });

    if (locking) {
      // G-22: write the audit row directly — writeAudit() calls next/headers,
      // whose context is unreliable inside authorize().
      //
      // WP-3.1 (DEF-005): carry tenantId so the lock event is inside the
      // tenant hash chain (it was previously omitted → the row sat outside the
      // chain and was invisible to tenant-scoped audit review). lockMinutes is
      // derived from the constant, not hard-coded, so the record can never
      // drift from the policy it documents.
      // try/catch rather than `.catch()`: a synchronous throw from the property
      // access is not a rejected promise and `.catch()` would miss it, letting
      // an audit failure escape as a 500 out of authorize(). Same fix, same
      // reason, as the helper in auth-audit.ts.
      try {
        await prisma.auditLog.create({
          data: {
            userId,
            tenantId,
            action: "AUTH_ACCOUNT_LOCKED",
            module: "AUTH",
            description: "Account temporarily locked after repeated failed sign-ins",
            metadata: {
              attempts: MAX_FAILED_ATTEMPTS,
              lockMinutes: LOCK_MS / 60_000,
            },
          },
        });
      } catch {
        // never let audit failure block the auth response
      }
    }
}

export async function authorizeCredentials(
  credentials: CredentialInput,
  // UAT-HF P10.07. NextAuth v5 passes the Request to `authorize`, which is the
  // reliable way to read headers here — `next/headers` is not dependable inside
  // authorize(), which is why the audit writes in this file bypass writeAudit().
  request?: Request,
): Promise<User | null> {
  return measureAsync("auth.credentials.authorize", async () => {
    if (!credentials?.email || !credentials?.password) {
      return null;
    }

    // Source-level throttle, checked BEFORE any lookup or comparison. Refusing
    // after the bcrypt has run would cost precisely what it exists to save.
    const ip = rateLimitKey(request?.headers);
    const gate = await checkIpGate(ip);
    if (gate.blocked) {
      // Same generic null as every other rejection (D-13). The two-step action
      // is what the sign-in page calls first and it CAN say something useful,
      // so in practice a real person sees an honest message, not this.
      return null;
    }

    const user = await measureAsync("auth.credentials.user_lookup", () =>
      prisma.user.findFirst({
        where: {
          email: credentials.email as string,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          role: true,
          tenantId: true,
          clientId: true,
          groupId: true,
          memberId: true,
          providerId: true,
          totpSecret: true,
          totpEnabled: true,
          mustChangePassword: true,
          // DEF-002: the lockout state travels with the credential lookup.
          failedLoginCount: true,
          lastFailedLoginAt: true,
          lockedUntil: true,
        },
      }),
    );

    if (!user) {
      // Non-existent accounts are never locked and reveal nothing (D-13).
      //
      // UAT-HF P10.05: the lookup above filters on isActive, so this branch is
      // reached by two very different events — an address with no account, and
      // a real account that has been switched off. The second is worth
      // recording (an ex-employee's credentials still being tried is exactly
      // the thing an investigation wants), and it is the only one that CAN be
      // recorded: AuditLog.userId is a required FK, so an unknown address has
      // nothing to attach a row to. See auth-audit.ts.
      //
      // This lookup is audit-only and deliberately separate from the credential
      // query. A deactivated user must never authenticate, and the way to be
      // certain of that is to never load them into the path that could.
      // Spend what a real comparison costs. Placed here, on the branch that
      // previously returned in microseconds, this is the actual fix for the
      // enumeration oracle.
      await equaliseRejectionTiming(credentials.password as string);

      // A nonexistent address counts toward the source limit. It has to: a
      // sweep across addresses that do not exist is the pattern with NO
      // per-account counter behind it, so this is the only control that sees it.
      if (await registerIpFailure(ip)) {
        reportIpBlocked(ip!, IP_FAILURE_LIMIT, IP_WINDOW_MS / 60_000);
      }

      const deactivated = await findDeactivatedAccount(credentials.email as string);
      if (deactivated) {
        await recordInactiveAccountSignIn({
          userId: deactivated.id,
          tenantId: deactivated.tenantId,
        });
      }
      return null; // D-13: the response is identical either way
    }

    // DEF-002 AC 2: an active temporary lock fails the login even with the
    // correct password. Checked BEFORE bcrypt.compare against the REAL hash, so
    // a locked account is never told whether the password was right.
    //
    // It does spend an equalising compare. Returning instantly here would move
    // the enumeration oracle rather than close it: once an unknown address
    // costs ~100 ms, an instant refusal identifies a locked — therefore
    // EXISTING — account. The CPU argument for skipping it does not hold,
    // because the same attacker can force a compare with any unknown address.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await equaliseRejectionTiming(credentials.password as string);
      // UAT-HF P10.05. These attempts are deliberately NOT counted by the
      // throttle — counting them would let an attacker hold a victim's lock
      // open for ever — which also meant they were recorded nowhere at all.
      // "The attempts kept coming through the lock" is the whole difference
      // between a forgetful user and somebody working a list, so it is now
      // recorded, once per lock.
      await recordBlockedSignIn({
        userId: user.id,
        tenantId: user.tenantId,
        lockedUntil: user.lockedUntil,
      });
      return null; // D-13: identical generic null as any wrong password
    }

    const isPasswordValid = await measureAsync("auth.credentials.password_compare", () =>
      bcrypt.compare(credentials.password as string, user.passwordHash),
    );

    // Two-factor (R81): when enabled a valid TOTP is mandatory. Evaluated as part
    // of the single `authOk` boolean so a missing/wrong code on a correct
    // password ALSO counts as a failed authentication of this account (D-11).
    let totpOk = true;
    if (user.totpEnabled && user.totpSecret) {
      const code = (credentials.totp as string | undefined)?.trim();
      // UAT-HF P10.03 — DEF-013. Verifying that a code is *currently valid* is
      // not enough: the run signed in, logged out, and signed in AGAIN with the
      // same code in a fresh browser profile. The time step has to be spent.
      const counter = code ? verifyTotpCounter(user.totpSecret, code) : null;
      totpOk =
        counter !== null &&
        // Only spend the step once the password is known good, so a wrong
        // password cannot burn a legitimate user's code out from under them.
        isPasswordValid &&
        (await consumeTotpCounter(prisma, user.id, counter));
    }
    const authOk = isPasswordValid && totpOk;

    if (!authOk) {
      // UAT-HF P10.05 — which half failed is the single most useful thing in
      // this record. A rejected code on a CORRECT password means somebody has
      // the password; a rejected password does not. Both return the same
      // nothing to the caller (D-13); only the audit row distinguishes them.
      await registerFailedAttempt(
        user.id,
        user.tenantId,
        isPasswordValid ? "BAD_TOTP" : "BAD_PASSWORD",
      );
      if (await registerIpFailure(ip)) {
        reportIpBlocked(ip!, IP_FAILURE_LIMIT, IP_WINDOW_MS / 60_000);
      }

      return null; // D-13: same generic null as any wrong password
    }

    const permissions = await loadUserPermissions(user.id, user.tenantId, user.role);

    // Single-session control (R25): bump the version so this login supersedes any
    // prior session. The successful login also clears the lockout counter as part
    // of the SAME write (D-9 / R3 step 5) — one update, not two.
    const bumped = await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionVersion: { increment: 1 },
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: { sessionVersion: true },
    });

    // WP-3.1 (DEF-005): a login reaching this point with a lock still stamped on
    // the row can only be a lock that has ELAPSED (a live lock fails earlier, at
    // the lockedUntil check above). Record the recovery so lock → expiry →
    // successful sign-in is a complete, observable lifecycle — not just a lock
    // event with no matching release. tenantId keeps it inside the hash chain.
    if (user.lockedUntil) {
      // try/catch, not `.catch()` — see the lock-audit block above. This one
      // sits on the SUCCESS path, where an escaping exception would fail a
      // sign-in that had already been authenticated.
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            action: "AUTH_ACCOUNT_UNLOCKED",
            module: "AUTH",
            description: "Account lock cleared on successful sign-in after the lock window elapsed",
            metadata: { reason: "LOCK_EXPIRED_LOGIN" },
          },
        });
      } catch {
        // audit failure must never block the auth response
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      tenantId: user.tenantId,
      clientId: user.clientId ?? undefined,
      groupId: user.groupId ?? undefined,
      memberId: user.memberId ?? undefined,
      providerId: user.providerId ?? undefined,
      permissions,
      sessionVersion: bumped.sessionVersion,
      // WP-8 (DEC-09): privileged roles must enrol an authenticator — login is
      // allowed (grace) but requireRole confines the session to Settings →
      // Security until enrolment completes.
      mustEnrollTotp: totpEnrolmentRequiredNow(user.role, user.totpEnabled),
      // ELIG-GAP-006: a temporary/admin-set password confines the user to
      // /change-password (enforced in requireRole) until they replace it.
      mustChangePassword: user.mustChangePassword,
    };
  });
}
