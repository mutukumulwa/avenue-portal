/**
 * WP-3.5B (read side) / PROD-BLOCKER-3 twin — the tRPC `reports.*` queries are
 * role-gated.
 *
 * The HTTP export routes (`/api/reports/**`) were gated to ROLES.ANY_STAFF, but
 * the `reports` tRPC router exposed the same tenant-wide claim / membership /
 * billing / utilization registers to ANY authenticated role via `/api/trpc`
 * (they ran on `protectedProcedure`). This is the read-side twin of the mutation
 * door closed in trpc-mutation-authorization.test.ts.
 *
 * This suite proves those queries now use `reportsProcedure` (ROLES.ANY_STAFF):
 * portal roles (member/provider/HR/broker/fund) are REJECTED at the boundary,
 * while internal + reporting staff (incl. REPORTS_VIEWER, which legitimately
 * needs read access) are ADMITTED past the gate (they may then fail input
 * validation on the minimal `{}` input — that is NOT an authorization failure).
 *
 * Runs with no database and no environment.
 */
import { describe, it, expect, vi } from "vitest";

const throwingPrisma = vi.hoisted(() =>
  new Proxy(
    {},
    { get: () => new Proxy({}, { get: () => async () => { throw new Error("prisma mocked — no DB in authz test"); } }) },
  ),
);
vi.mock("@/lib/prisma", () => ({ prisma: throwingPrisma }));
vi.mock("@/lib/auth", () => ({
  auth: async () => null,
  getCachedSession: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

import { createCallerFactory } from "@/server/trpc/trpc";
import { effectivePermissions } from "@/lib/authz/catalog";
import { reportsRouter } from "@/server/trpc/routers/reports";

function ctxFor(role: string | null) {
  return {
    session: role ? { user: { id: "u-test", role, tenantId: "t1", permissions: effectivePermissions(role) } } : null,
    tenantId: "t1",
    clientId: undefined,
    prisma: throwingPrisma,
    user: role ? { id: "u-test", role } : undefined,
  } as never;
}

const call = (ctx: unknown, proc: string, input: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (createCallerFactory(reportsRouter as any)(ctx as any) as any)[proc](input);

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { code?: string })?.code;
  }
}

const AUTH_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED"]);
// A representative sample of the 7 report queries.
const PROCS = ["claimsSummary", "membershipReport", "billingReport", "utilizationReport"];
const DENIED_ROLES = ["MEMBER_USER", "PROVIDER_USER", "HR_MANAGER", "BROKER_USER", "FUND_ADMINISTRATOR"];
const ADMITTED_ROLES = ["SUPER_ADMIN", "REPORTS_VIEWER", "CLAIMS_OFFICER", "FINANCE_OFFICER"];

describe("PROD-BLOCKER-3 twin — reports.* tRPC queries reject non-staff roles", () => {
  for (const proc of PROCS) {
    it(`${proc} denies an unauthenticated caller`, async () => {
      expect(await codeOf(call(ctxFor(null), proc, {}))).toBe("UNAUTHORIZED");
    });
    for (const role of DENIED_ROLES) {
      it(`${proc} denies ${role}`, async () => {
        expect(await codeOf(call(ctxFor(role), proc, {}))).toBe("FORBIDDEN");
      });
    }
    for (const role of ADMITTED_ROLES) {
      it(`${proc} admits ${role} past the gate`, async () => {
        // Passes authorization; may fail input validation (BAD_REQUEST) on {} —
        // that is not an authorization rejection.
        const code = await codeOf(call(ctxFor(role), proc, {}));
        expect(AUTH_CODES.has(code ?? "")).toBe(false);
      });
    }
  }
});
