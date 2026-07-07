import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { measureAsync } from "@/lib/perf";
import { verifyTotp } from "@/lib/totp";

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
const sessionVersionCache = new Map<string, { version: number; at: number }>();
const SESSION_VERSION_TTL_MS = 15_000;
async function currentSessionVersion(userId: string): Promise<number | null> {
  const hit = sessionVersionCache.get(userId);
  if (hit && Date.now() - hit.at < SESSION_VERSION_TTL_MS) return hit.version;
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    if (!row) return null;
    sessionVersionCache.set(userId, { version: row.sessionVersion, at: Date.now() });
    return row.sessionVersion;
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
        return token;
      }
      // Subsequent requests: invalidate if a newer login has superseded this
      // session (single-session, R25). Fail-open when the version is unknown.
      if (token.id && typeof token.sessionVersion === "number") {
        const current = await currentSessionVersion(token.id as string);
        if (current !== null && current > (token.sessionVersion as number)) {
          return null; // stale session → sign out
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
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  }
});

export const getCachedSession = cache(() =>
  measureAsync("auth.session", () => auth())
);
