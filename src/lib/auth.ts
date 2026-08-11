import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { measureAsync } from "@/lib/perf";
import { totpEnrolmentRequiredNow } from "@/lib/totp";
import { authorizeCredentials } from "@/lib/auth-credentials";
import { SESSION_IDLE_MAX_AGE_S, SESSION_UPDATE_AGE_S } from "@/lib/session-policy";

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
  // D-19: 30-min rolling idle expiry, refreshed on activity at most every 5 min.
  session: { strategy: "jwt", maxAge: SESSION_IDLE_MAX_AGE_S, updateAge: SESSION_UPDATE_AGE_S },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" }
      },
      // DEF-002: credential authorization (incl. brute-force lockout) lives in
      // src/lib/auth-credentials.ts so it can be unit-tested without importing
      // the whole next-auth machinery.
      authorize: authorizeCredentials,
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
        token.mustChangePassword = user.mustChangePassword;
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
          token.mustEnrollTotp = totpEnrolmentRequiredNow(token.role as string | undefined, state.totpEnabled);
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
        session.user.mustChangePassword = token.mustChangePassword as boolean | undefined;
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
