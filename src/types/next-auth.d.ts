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
      providerId?: string;
      permissions?: string[];
      /** WP-8 (DEC-09): privileged role signed in without an enrolled authenticator. */
      mustEnrollTotp?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    tenantId?: string;
    clientId?: string;
    role?: string;
    groupId?: string;
    memberId?: string;
    providerId?: string;
    permissions?: string[];
    sessionVersion?: number;
    /** WP-8 (DEC-09): privileged role signed in without an enrolled authenticator. */
    mustEnrollTotp?: boolean;
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
    providerId?: string;
    permissions?: string[];
    sessionVersion?: number;
    /** WP-8 (DEC-09): privileged role signed in without an enrolled authenticator. */
    mustEnrollTotp?: boolean;
  }
}
