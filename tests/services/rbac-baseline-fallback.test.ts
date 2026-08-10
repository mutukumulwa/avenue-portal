/**
 * WP-3.5A (PROD-BLOCKER-1) — rbacService resolves the enum-role baseline when a
 * user has zero dynamic UserRoleAssignment rows (production today).
 *
 * These are pure unit tests: prisma is fully mocked so the assertions exercise
 * only the union logic. They pin the two properties the plan calls out as
 * delicate:
 *   • fail-OPEN correctly — a role with no dynamic rows resolves EXACTLY its
 *     documented baseline (SUPER_ADMIN's "*" included), so the ROLE:ASSIGN
 *     bootstrap deadlock and the quotation/intake/binding/override/role-admin
 *     gates stop failing closed; and
 *   • never fail-open TOO FAR — the baseline is never a superset, so the S1
 *     leaks two prior UAT runs found (CUSTOMER_SERVICE / UNDERWRITER over-reach)
 *     cannot return through the fallback, and provider personas stay
 *     dynamic-only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  userRoleAssignment: { findMany: vi.fn(), count: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { rbacService } from "@/server/services/rbac.service";
import { ROLE_GRANTS, effectivePermissions } from "@/lib/authz/catalog";

/** Point the mocked prisma at a user with `role` and a dynamic overlay. */
function configure(role: string | null, dynamicCodes: string[] = []) {
  mockPrisma.user.findFirst.mockResolvedValue(role ? { role } : null);
  mockPrisma.userRoleAssignment.findMany.mockResolvedValue(
    dynamicCodes.length
      ? [{ role: { permissions: dynamicCodes.map((code) => ({ permission: { code } })) } }]
      : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the user holds no dynamic role assignment (prod state).
  mockPrisma.userRoleAssignment.count.mockResolvedValue(0);
});

describe("rbacService.getUserPermissions — baseline fallback", () => {
  it("SUPER_ADMIN with zero dynamic rows resolves the '*' wildcard baseline", async () => {
    configure("SUPER_ADMIN", []);
    const perms = await rbacService.getUserPermissions("u", "t");
    expect(perms).toContain("*");
    expect(new Set(perms)).toEqual(new Set(effectivePermissions("SUPER_ADMIN")));
  });

  it("a non-super enum role resolves EXACTLY its baseline — not empty, not a superset", async () => {
    configure("CLAIMS_OFFICER", []);
    const perms = await rbacService.getUserPermissions("u", "t");
    expect(perms.length).toBeGreaterThan(0);
    expect(new Set(perms)).toEqual(new Set(ROLE_GRANTS.CLAIMS_OFFICER));
    expect(perms).not.toContain("*");
  });

  it("PROVIDER_USER has an empty baseline — persona grants stay dynamic-only", async () => {
    configure("PROVIDER_USER", []);
    expect(await rbacService.getUserPermissions("u", "t")).toEqual([]);
  });

  it("the dynamic overlay is strictly ADDITIVE — union of baseline and grants", async () => {
    // OVERRIDE:APPROVE_DUAL is NOT in the CLAIMS_OFFICER baseline.
    configure("CLAIMS_OFFICER", ["OVERRIDE:APPROVE_DUAL"]);
    const perms = await rbacService.getUserPermissions("u", "t");
    expect(perms).toEqual(
      expect.arrayContaining([...ROLE_GRANTS.CLAIMS_OFFICER, "OVERRIDE:APPROVE_DUAL"]),
    );
  });

  it("an unknown / cross-tenant user (no row) resolves to no permissions (fail-closed)", async () => {
    configure(null, []);
    expect(await rbacService.getUserPermissions("u", "t")).toEqual([]);
  });
});

describe("rbacService.hasPermission / requirePermission — baseline fallback", () => {
  it("SUPER_ADMIN passes every permission, incl. ROLE:ASSIGN (bootstrap deadlock broken)", async () => {
    configure("SUPER_ADMIN", []);
    expect(await rbacService.hasPermission("u", "ROLE:ASSIGN", "t")).toBe(true);
    expect(await rbacService.hasPermission("u", "QUOTATION:ISSUE", "t")).toBe(true);
    await expect(
      rbacService.requirePermission("u", "ROLE:ASSIGN", "t"),
    ).resolves.toBeUndefined();
  });

  it("grants a role the permissions inside its baseline", async () => {
    configure("CLAIMS_OFFICER", []);
    expect(await rbacService.hasPermission("u", "CLAIM:VIEW", "t")).toBe(true);
  });

  it("denies a role permissions OUTSIDE its baseline (no privilege widening)", async () => {
    configure("CLAIMS_OFFICER", []);
    expect(await rbacService.hasPermission("u", "QUOTATION:ISSUE", "t")).toBe(false);
    expect(await rbacService.hasPermission("u", "ROLE:ASSIGN", "t")).toBe(false);
  });

  it("keeps CUSTOMER_SERVICE membership-only — the DEF-003 S1 leak cannot return", async () => {
    configure("CUSTOMER_SERVICE", []);
    expect(await rbacService.hasPermission("u", "MEMBER:VIEW", "t")).toBe(true);
    expect(await rbacService.hasPermission("u", "CLAIM:VIEW", "t")).toBe(false);
    expect(await rbacService.hasPermission("u", "BILLING:VIEW", "t")).toBe(false);
    expect(await rbacService.hasPermission("u", "ANALYTICS:VIEW", "t")).toBe(false);
  });

  it("keeps UNDERWRITER off claim data — the DEF-004 S1 leak cannot return", async () => {
    configure("UNDERWRITER", []);
    expect(await rbacService.hasPermission("u", "QUOTATION:ISSUE", "t")).toBe(true);
    expect(await rbacService.hasPermission("u", "CLAIM:VIEW", "t")).toBe(false);
  });

  it("requirePermission throws FORBIDDEN when the baseline does not cover the code", async () => {
    configure(null, []);
    await expect(
      rbacService.requirePermission("u", "CLAIM:VIEW", "t"),
    ).rejects.toThrow(/Permission required/);
  });
});

describe("rbacService.hasRole — baseline fallback", () => {
  it("a user effectively holds their enum role with zero dynamic rows", async () => {
    configure("SUPER_ADMIN", []);
    expect(await rbacService.hasRole("u", "SUPER_ADMIN", "t")).toBe(true);

    configure("CLAIMS_OFFICER", []);
    expect(await rbacService.hasRole("u", "CLAIMS_OFFICER", "t")).toBe(true);
  });

  it("does not grant a role the user's enum role is not", async () => {
    configure("CLAIMS_OFFICER", []);
    expect(await rbacService.hasRole("u", "SUPER_ADMIN", "t")).toBe(false);
  });

  it("does not grant provider persona roles from the PROVIDER_USER baseline", async () => {
    configure("PROVIDER_USER", []);
    expect(await rbacService.hasRole("u", "PROVIDER_BILLER", "t")).toBe(false);
  });

  it("honors a dynamic assignment whose role differs from the enum role", async () => {
    mockPrisma.userRoleAssignment.count.mockResolvedValue(1);
    configure("CLAIMS_OFFICER", []);
    expect(await rbacService.hasRole("u", "SENIOR_CLAIMS_OFFICER", "t")).toBe(true);
    // The enum-role lookup is not even consulted when a dynamic row matches.
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });
});
