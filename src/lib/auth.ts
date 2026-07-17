import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { measureAsync } from "@/lib/perf";
import { verifyTotp, totpEnrolmentRequired } from "@/lib/totp";

/** Loads all active permission codes for a user from UserRoleAssignment. */
async function loadUserPermissions(userId: string, tenantId: string): Promise<string[]> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId, tenantId, isActive: true, status: "ACTIVE" },
    include: {
      role: {
        include: { permissions: { include: { permission: { select: { code: true } } } } },
      },
    },
  });
  const codes = new Set<string>();
  for (const a of assignments) {
    for (const rp of a.role.permissions) codes.add(rp.permission.code);
  }
  return [...codes];
}

/**
 * Current sessionVersion for a user, cached briefly to bound the per-request DB
 * cost of single-session enforcement (R25). Returns null on error (fail-open).
 */
const sessionStateCache = new Map<string, { version: number; totpEnabled: boolean; at: number }>();
const SESSION_VERSION_TTL_MS = 15_000;
async function currentSessionState(
  userId: string,
): Promise<{ version: number; totpEnabled: boolean } | null> {
  const hit = sessionStateCache.get(userId);
  if (hit && Date.now() - hit.at < SESSION_VERSION_TTL_MS) return hit;
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      // WP-8: totpEnabled rides the same single-session query (R25) so the
      // enrolment flag self-heals within the cache TTL — no re-login needed
      // after the user enables their authenticator.
      select: { sessionVersion: true, totpEnabled: true },
    });
    if (!row) return null;
    const state = { version: row.sessionVersion, totpEnabled: row.totpEnabled, at: Date.now() };
    sessionStateCache.set(userId, state);
    return state;
  } catch {
    return null; // fail-open: never lock users out on a transient DB error
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" }
      },
      async authorize(credentials) {
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
              },
            })
          );

          if (!user) {
            return null;
          }

          const isPasswordValid = await measureAsync("auth.credentials.password_compare", () =>
            bcrypt.compare(credentials.password as string, user.passwordHash)
          );

          if (!isPasswordValid) {
            return null;
          }

          // Two-factor (R81): when enabled, a valid TOTP is mandatory. A
          // missing/incorrect code fails the login (the form surfaces the code
          // field so the user can retry).
          if (user.totpEnabled && user.totpSecret) {
            const code = (credentials.totp as string | undefined)?.trim();
            if (!code || !verifyTotp(user.totpSecret, code)) {
              return null;
            }
          }

          const permissions = await loadUserPermissions(user.id, user.tenantId);

          // Single-session control (R25): bump the version so this login
          // supersedes any prior session; the new version rides in the JWT.
          const bumped = await prisma.user.update({
            where: { id: user.id },
            data: { sessionVersion: { increment: 1 }, lastLoginAt: new Date() },
            select: { sessionVersion: true },
          });

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
            // WP-8 (DEC-09): privileged roles must enrol an authenticator —
            // login is allowed (grace) but requireRole confines the session to
            // Settings → Security until enrolment completes.
            mustEnrollTotp: totpEnrolmentRequired(user.role, user.totpEnabled),
          };
        });
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.clientId = user.clientId;
        token.groupId = user.groupId;
        token.memberId = user.memberId;
        token.providerId = user.providerId;
        token.permissions = user.permissions;
        token.sessionVersion = user.sessionVersion;
        token.mustEnrollTotp = user.mustEnrollTotp;
        return token;
      }
      // Subsequent requests: invalidate if a newer login has superseded this
      // session (single-session, R25). Fail-open when the version is unknown.
      if (token.id && typeof token.sessionVersion === "number") {
        const state = await currentSessionState(token.id as string);
        if (state !== null && state.version > (token.sessionVersion as number)) {
          return null; // stale session → sign out
        }
        // WP-8: recompute the enrolment flag from the same lookup so enabling
        // TOTP unlocks the session within the cache TTL (~15s), no re-login.
        if (state !== null) {
          token.mustEnrollTotp = totpEnrolmentRequired(token.role as string | undefined, state.totpEnabled);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string | undefined;
        session.user.tenantId = token.tenantId as string;
        session.user.clientId = token.clientId as string | undefined;
        session.user.groupId = token.groupId as string | undefined;
        session.user.memberId = token.memberId as string | undefined;
        session.user.providerId = token.providerId as string | undefined;
        session.user.permissions = token.permissions as string[] | undefined;
        session.user.mustEnrollTotp = token.mustEnrollTotp as boolean | undefined;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
    // CU-OBS-4: branded confirmation page instead of the framework default.
    signOut: "/signout",
  }
});

export const getCachedSession = cache(() =>
  measureAsync("auth.session", () => auth())
);
