/**
 * WP-3.5B / PROD-BLOCKER-2 / L-13 — the tRPC mutation surface is role-gated.
 *
 * Before this change all ~130 `.mutation` procedures ran on `protectedProcedure`
 * (session-exists only), so any authenticated user of any role — a member, a
 * provider biller, a reports viewer — could POST `contracts.activate`,
 * `providers.create`, `packages.*`, `settings.updateUserRole`, `roles.assignRole`,
 * etc. via `/api/trpc`. The server-action layer was `requireRole`-guarded; the
 * tRPC layer was an unguarded parallel door to the SAME services.
 *
 * This suite proves the door is shut: for a representative sample spanning many
 * routers, an unauthorized role (MEMBER_USER, REPORTS_VIEWER, and — where it
 * demonstrates least-privilege — a foreign internal role) is REJECTED at the
 * procedure boundary, while the legitimate role is ADMITTED (passes the gate;
 * it may then fail input validation, which is NOT an authorization failure).
 *
 * Authorization runs as a tRPC middleware, BEFORE input parsing and before the
 * resolver — so a rejected role throws FORBIDDEN regardless of the (minimal)
 * input, and an admitted role reaches input validation (BAD_REQUEST) without
 * ever touching the database. prisma/rbacService are mocked as belt-and-braces
 * so no resolver can reach a real DB.
 *
 * Runs with no database and no environment.
 */
import { describe, it, expect, vi } from "vitest";

// No resolver should run (auth rejects first, or input validation fails first),
// but mock the data layer so a stray resolver can never reach a real DB.
const throwingPrisma = vi.hoisted(() =>
  new Proxy(
    {},
    { get: () => new Proxy({}, { get: () => async () => { throw new Error("prisma mocked — no DB in authz test"); } }) },
  ),
);
vi.mock("@/lib/prisma", () => ({ prisma: throwingPrisma }));
// analyticsRouter imports "@/lib/rbac", whose top-level `import { getCachedSession }
// from "@/lib/auth"` pulls in the next-auth graph (next/server), which does not
// resolve under jsdom. Stub it — authorization here runs on the enum role in the
// tRPC context, not on a live session lookup.
vi.mock("@/lib/auth", () => ({
  auth: async () => null,
  getCachedSession: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));
vi.mock("@/server/services/rbac.service", () => ({
  rbacService: {
    requirePermission: async () => {},
    hasRole: async () => true,
    assignRole: async () => ({}),
    approveRoleAssignment: async () => ({}),
    revokeRole: async () => ({}),
    listRoles: async () => [],
    listPermissions: async () => [],
    listAssignments: async () => [],
    listPendingAssignments: async () => [],
    getUserRoles: async () => [],
    getUserPermissions: async () => [],
  },
}));

import { createCallerFactory } from "@/server/trpc/trpc";
import { effectivePermissions } from "@/lib/authz/catalog";
import { contractsRouter } from "@/server/trpc/routers/contracts";
import { providersRouter } from "@/server/trpc/routers/providers";
import { packagesRouter } from "@/server/trpc/routers/packages";
import { coContributionRouter } from "@/server/trpc/routers/coContribution";
import { bindingRouter } from "@/server/trpc/routers/binding";
import { intakeRouter } from "@/server/trpc/routers/intake";
import { quotationsRouter } from "@/server/trpc/routers/quotations";
import { overridesRouter } from "@/server/trpc/routers/overrides";
import { rolesRouter } from "@/server/trpc/routers/roles";
import { settingsRouter } from "@/server/trpc/routers/settings";
import { claimsRouter } from "@/server/trpc/routers/claims";
import { billingRouter } from "@/server/trpc/routers/billing";
import { analyticsRouter } from "@/server/trpc/routers/analytics";
import { brokersRouter } from "@/server/trpc/routers/brokers";
import { crossBorderRouter } from "@/server/trpc/routers/crossBorder";

// A faithful session: enum role + the exact permission array production computes
// at login (enum baseline ∪ dynamic overlay = effectivePermissions). null role =
// unauthenticated.
function ctxFor(role: string | null) {
  return {
    session: role ? { user: { id: "u-test", role, tenantId: "t1", permissions: effectivePermissions(role) } } : null,
    tenantId: "t1",
    clientId: undefined,
    prisma: throwingPrisma,
    user: role ? { id: "u-test", role } : undefined,
  } as never;
}

const call = (router: unknown, ctx: unknown, proc: string, input: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (createCallerFactory(router as any)(ctx as any) as any)[proc](input);

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined; // resolved — definitely not an auth rejection
  } catch (e) {
    return (e as { code?: string })?.code;
  }
}

const DENIED = "FORBIDDEN";
const AUTH_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED"]);

// name, router, procedure, an authorized role, minimal input, and any FOREIGN
// internal roles that must ALSO be denied (least-privilege / persona-matrix).
const SAMPLES: Array<{
  name: string;
  router: unknown;
  proc: string;
  authorized: string;
  input: unknown;
  foreignDenied?: string[];
}> = [
  { name: "contracts.create (UNDERWRITING)", router: contractsRouter, proc: "create", authorized: "UNDERWRITER", input: {}, foreignDenied: ["CLAIMS_OFFICER"] },
  { name: "contracts.activate (UNDERWRITING)", router: contractsRouter, proc: "activate", authorized: "UNDERWRITER", input: {} },
  { name: "providers.create (ADMIN_ONLY)", router: providersRouter, proc: "create", authorized: "SUPER_ADMIN", input: {}, foreignDenied: ["UNDERWRITER", "CLAIMS_OFFICER"] },
  { name: "providers.addTariff (ADMIN_ONLY)", router: providersRouter, proc: "addTariff", authorized: "SUPER_ADMIN", input: {}, foreignDenied: ["UNDERWRITER"] },
  { name: "packages.create (UNDERWRITING)", router: packagesRouter, proc: "create", authorized: "UNDERWRITER", input: {} },
  { name: "packages.deleteSharedLimit (UNDERWRITING)", router: packagesRouter, proc: "deleteSharedLimit", authorized: "UNDERWRITER", input: {} },
  { name: "coContribution.upsertCap (UNDERWRITING)", router: coContributionRouter, proc: "upsertCap", authorized: "UNDERWRITER", input: {} },
  { name: "coContribution.waive (internal staff)", router: coContributionRouter, proc: "waive", authorized: "CLAIMS_OFFICER", input: {} },
  { name: "binding.createMemberships (MEMBER:CREATE)", router: bindingRouter, proc: "createMemberships", authorized: "UNDERWRITER", input: {} },
  { name: "binding.approveBinder (QUOTATION:APPROVE_BINDER)", router: bindingRouter, proc: "approveBinder", authorized: "SUPER_ADMIN", input: {}, foreignDenied: ["CLAIMS_OFFICER"] },
  { name: "intake.create (UNDERWRITING)", router: intakeRouter, proc: "create", authorized: "UNDERWRITER", input: {} },
  { name: "intake.recordDecision (UNDERWRITING:RECORD_DECISION)", router: intakeRouter, proc: "recordDecision", authorized: "UNDERWRITER", input: {}, foreignDenied: ["CLAIMS_OFFICER"] },
  { name: "quotations.create (UNDERWRITING)", router: quotationsRouter, proc: "create", authorized: "UNDERWRITER", input: {} },
  { name: "quotations.issueQuote (QUOTATION:ISSUE)", router: quotationsRouter, proc: "issueQuote", authorized: "UNDERWRITER", input: {}, foreignDenied: ["CLAIMS_OFFICER"] },
  { name: "overrides.request (OVERRIDE:REQUEST)", router: overridesRouter, proc: "request", authorized: "CLAIMS_OFFICER", input: {} },
  { name: "overrides.approve (internal staff)", router: overridesRouter, proc: "approve", authorized: "SUPER_ADMIN", input: {} },
  { name: "roles.assignRole (ROLE:ASSIGN)", router: rolesRouter, proc: "assignRole", authorized: "SUPER_ADMIN", input: {}, foreignDenied: ["CLAIMS_OFFICER", "UNDERWRITER"] },
  { name: "settings.updateUserRole (ADMIN_ONLY)", router: settingsRouter, proc: "updateUserRole", authorized: "SUPER_ADMIN", input: {}, foreignDenied: ["UNDERWRITER", "FINANCE_OFFICER"] },
  { name: "claims.adjudicate (CLINICAL)", router: claimsRouter, proc: "adjudicate", authorized: "CLAIMS_OFFICER", input: {}, foreignDenied: ["UNDERWRITER"] /* DEF-004 */ },
  { name: "billing.createInvoice (FINANCE)", router: billingRouter, proc: "createInvoice", authorized: "FINANCE_OFFICER", input: {}, foreignDenied: ["UNDERWRITER", "CLAIMS_OFFICER"] },
  { name: "analytics.acknowledgeAlert (internal staff, not reports viewer)", router: analyticsRouter, proc: "acknowledgeAlert", authorized: "CLAIMS_OFFICER", input: {} },
  { name: "brokers.approveCommission (FINANCE)", router: brokersRouter, proc: "approveCommission", authorized: "FINANCE_OFFICER", input: {}, foreignDenied: ["UNDERWRITER"] },
  { name: "crossBorder.openCase (MEMBER_OPS)", router: crossBorderRouter, proc: "openCase", authorized: "CUSTOMER_SERVICE", input: {} },
];

describe("PROD-BLOCKER-2 — every sampled tRPC mutation rejects unauthorized roles", () => {
  it.each(SAMPLES)("$name denies MEMBER_USER", async ({ router, proc, input }) => {
    expect(await codeOf(call(router, ctxFor("MEMBER_USER"), proc, input))).toBe(DENIED);
  });

  it.each(SAMPLES)("$name denies REPORTS_VIEWER (read-only)", async ({ router, proc, input }) => {
    expect(await codeOf(call(router, ctxFor("REPORTS_VIEWER"), proc, input))).toBe(DENIED);
  });

  it.each(SAMPLES)("$name denies PROVIDER_USER", async ({ router, proc, input }) => {
    expect(await codeOf(call(router, ctxFor("PROVIDER_USER"), proc, input))).toBe(DENIED);
  });

  it.each(SAMPLES)("$name denies an unauthenticated caller", async ({ router, proc, input }) => {
    // No session → protectedProcedure's authed check → UNAUTHORIZED.
    expect(await codeOf(call(router, ctxFor(null), proc, input))).toBe("UNAUTHORIZED");
  });
});

describe("PROD-BLOCKER-2 — foreign internal roles are denied (least-privilege / persona matrix)", () => {
  const withForeign = SAMPLES.filter((s) => s.foreignDenied?.length);
  it.each(withForeign)("$name denies its foreign internal roles", async ({ router, proc, input, foreignDenied }) => {
    for (const role of foreignDenied!) {
      expect(await codeOf(call(router, ctxFor(role), proc, input)), `${role} should be denied`).toBe(DENIED);
    }
  });
});

describe("PROD-BLOCKER-2 — the legitimate role is admitted past the gate", () => {
  it.each(SAMPLES)("$name admits its authorized role (no auth error)", async ({ router, proc, authorized, input }) => {
    // Admitted = passes the gate. It then fails input validation (BAD_REQUEST)
    // with our empty input — which proves the gate let it through. The one thing
    // it must NOT be is an authorization rejection.
    const code = await codeOf(call(router, ctxFor(authorized), proc, input));
    expect(AUTH_CODES.has(code ?? ""), `authorized ${authorized} was blocked with ${code}`).toBe(false);
  });

  it("SUPER_ADMIN (wildcard) is admitted to every sampled mutation", async () => {
    for (const { router, proc, input } of SAMPLES) {
      const code = await codeOf(call(router, ctxFor("SUPER_ADMIN"), proc, input));
      expect(AUTH_CODES.has(code ?? ""), `${proc} blocked SUPER_ADMIN with ${code}`).toBe(false);
    }
  });
});
