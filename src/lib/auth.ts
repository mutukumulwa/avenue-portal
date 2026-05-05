import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { measureAsync } from "@/lib/perf";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
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
                groupId: true,
                memberId: true,
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

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role,
            tenantId: user.tenantId,
            groupId: user.groupId ?? undefined,
            memberId: user.memberId ?? undefined,
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
        token.groupId = user.groupId;
        token.memberId = user.memberId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string | undefined;
        session.user.tenantId = token.tenantId as string;
        session.user.groupId = token.groupId as string | undefined;
        session.user.memberId = token.memberId as string | undefined;
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
