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
      /** ELIG-GAP-006: admin-set temporary password; confined to /change-password until replaced. */
      mustChangePassword?: boolean;
      /**
       * UAT-HF P10.04 (DEF-015): when this session was authenticated, in ms.
       * Stamped once and never refreshed — the absolute lifetime is measured
       * from here, and no amount of activity extends it.
       */
      authenticatedAt?: number;
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
      /** ELIG-GAP-006: admin-set temporary password; confined to /change-password until replaced. */
      mustChangePassword?: boolean;
    /** UAT-HF P10.04 (DEF-015): authentication instant; never refreshed. */
    authenticatedAt?: number;
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
      /** ELIG-GAP-006: admin-set temporary password; confined to /change-password until replaced. */
      mustChangePassword?: boolean;
    /** UAT-HF P10.04 (DEF-015): authentication instant; never refreshed. */
    authenticatedAt?: number;
  }
}
