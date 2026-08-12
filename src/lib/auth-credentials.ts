import type { User } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { measureAsync } from "@/lib/perf";
import { consumeTotpCounter, verifyTotpCounter, totpEnrolmentRequiredNow } from "@/lib/totp";
import { effectivePermissions } from "@/lib/authz/catalog";

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
export const LOCK_DURATION_MS = 15 * 60_000; // D-10
export const ATTEMPT_WINDOW_MS = 15 * 60_000; // D-9

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

export async function authorizeCredentials(credentials: CredentialInput): Promise<User | null> {
  return measureAsync("auth.credentials.authorize", async () => {
    if (!credentials?.email || !credentials?.password) {
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
      return null;
    }

    // DEF-002 AC 2: an active temporary lock fails the login even with the
    // correct password. Checked BEFORE bcrypt.compare so a locked account never
    // spends a hash comparison.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
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
      // Rolling window (D-9): if the last failure is stale, this failure starts a
      // fresh count at 1 rather than extending an old streak.
      const windowActive =
        !!user.lastFailedLoginAt &&
        Date.now() - user.lastFailedLoginAt.getTime() < ATTEMPT_WINDOW_MS;
      const nextCount = (windowActive ? user.failedLoginCount : 0) + 1;
      const locking = nextCount >= MAX_FAILED_ATTEMPTS;

      await prisma.user
        .update({
          where: { id: user.id },
          data: {
            failedLoginCount: locking ? 0 : nextCount,
            lastFailedLoginAt: new Date(),
            lockedUntil: locking ? new Date(Date.now() + LOCK_DURATION_MS) : user.lockedUntil ?? null,
          },
        })
        // Throttling is best-effort-hardened: a transient DB error on the counter
        // must never turn a normal wrong-password into a 500.
        .catch(() => {});

      if (locking) {
        // G-22: write the audit row directly — writeAudit() calls next/headers,
        // whose context is unreliable inside authorize().
        //
        // WP-3.1 (DEF-005): carry tenantId so the lock event is inside the
        // tenant hash chain (it was previously omitted → the row sat outside the
        // chain and was invisible to tenant-scoped audit review). lockMinutes is
        // derived from the constant, not hard-coded, so the record can never
        // drift from the policy it documents.
        await prisma.auditLog
          .create({
            data: {
              userId: user.id,
              tenantId: user.tenantId,
              action: "AUTH_ACCOUNT_LOCKED",
              module: "AUTH",
              description: "Account temporarily locked after repeated failed sign-ins",
              metadata: {
                attempts: MAX_FAILED_ATTEMPTS,
                lockMinutes: LOCK_DURATION_MS / 60_000,
              },
            },
          })
          .catch(() => {}); // never let audit failure block the auth response
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
      await prisma.auditLog
        .create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            action: "AUTH_ACCOUNT_UNLOCKED",
            module: "AUTH",
            description: "Account lock cleared on successful sign-in after the lock window elapsed",
            metadata: { reason: "LOCK_EXPIRED_LOGIN" },
          },
        })
        .catch(() => {}); // audit failure must never block the auth response
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
