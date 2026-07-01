import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      clientId?: string;
      role?: string;
      groupId?: string;
      memberId?: string;
      permissions?: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    tenantId?: string;
    clientId?: string;
    role?: string;
    groupId?: string;
    memberId?: string;
    permissions?: string[];
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    clientId?: string;
    role?: string;
    groupId?: string;
    memberId?: string;
    permissions?: string[];
    sessionVersion?: number;
  }
}
