/**
 * WP-2 — authorization parity / drift detector (brief §5).
 *
 * DEF-003 and DEF-002 were caused by seven independent statements of "who may
 * do what" that were free to disagree. Removing the duplication is only half a
 * fix; without a test, it grows back. This suite fails the build when the
 * canonical catalog, the enum role sets, the seed grants and the navigation
 * stop agreeing.
 *
 * Runs with no database and no environment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROLE_GRANTS,
  SEED_DIVERGENCE_EXEMPT,
  INTERNAL_STAFF_ROLES,
  effectivePermissions,
  permitted,
  hasPerm,
  rolesWithPermission,
  ALL_PERMISSIONS,
} from "@/lib/authz/catalog";
import { ROLES, type UserRole } from "@/lib/authz/roles";
import { ROLE_PERMISSIONS as SEED_ROLE_PERMISSIONS } from "../../prisma/seeds/rbac";

const sorted = (xs: readonly string[]) => [...new Set(xs)].sort();

describe("catalog ↔ seed parity", () => {
  const enumRoles = Object.keys(ROLE_GRANTS) as UserRole[];

  it.each(enumRoles.filter((r) => !SEED_DIVERGENCE_EXEMPT.includes(r) && r !== "SUPER_ADMIN" && r !== "PROVIDER_USER"))(
    "%s grants match prisma/seeds/rbac.ts exactly",
    (role) => {
      const seed = SEED_ROLE_PERMISSIONS[role];
      // Only assert for roles the seed actually defines; provider personas and
      // the extended roles live in their own catalogs.
      if (!seed) return;
      expect(sorted(ROLE_GRANTS[role])).toEqual(sorted(seed));
    },
  );

  it("exempts only roles with a recorded decision behind the divergence", () => {
    // Growing this list must be a deliberate, reviewed act.
    expect(SEED_DIVERGENCE_EXEMPT).toEqual(["CUSTOMER_SERVICE"]);
  });

  it("CUSTOMER_SERVICE diverges from the seed in exactly the D1 Branch A way", () => {
    const seed = sorted(SEED_ROLE_PERMISSIONS.CUSTOMER_SERVICE ?? []);
    const catalog = sorted(ROLE_GRANTS.CUSTOMER_SERVICE);
    const removed = seed.filter((p) => !catalog.includes(p));
    const added = catalog.filter((p) => !seed.includes(p));

    expect(removed).toEqual(["ANALYTICS:VIEW", "BILLING:VIEW", "CLAIM:VIEW", "PREAUTH:VIEW"]);
    expect(added).toEqual([]);
  });
});

describe("decision D1 Branch A — the Membership Officer is membership-only", () => {
  it.each(["CLAIM:VIEW", "PREAUTH:VIEW", "BILLING:VIEW", "ANALYTICS:VIEW"])(
    "CUSTOMER_SERVICE does not hold %s",
    (code) => {
      expect(permitted(ROLE_GRANTS.CUSTOMER_SERVICE, code)).toBe(false);
    },
  );

  it("CUSTOMER_SERVICE retains its membership grants", () => {
    for (const code of ["MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND", "GROUP:VIEW"]) {
      expect(permitted(ROLE_GRANTS.CUSTOMER_SERVICE, code)).toBe(true);
    }
  });

  it("CUSTOMER_SERVICE is excluded from every claims role set", () => {
    expect(ROLES.CLAIMS_READ).not.toContain("CUSTOMER_SERVICE");
    expect(ROLES.CLAIMS_OPS).not.toContain("CUSTOMER_SERVICE");
    expect(ROLES.CLINICAL).not.toContain("CUSTOMER_SERVICE");
  });

  it("CUSTOMER_SERVICE remains a full member of the membership set", () => {
    expect(ROLES.MEMBER_OPS).toContain("CUSTOMER_SERVICE");
  });
});

describe("DEF-003 — role sets exclude the roles that leaked", () => {
  it("FUND_ADMINISTRATOR is not internal staff", () => {
    expect(ROLES.ANY_STAFF).not.toContain("FUND_ADMINISTRATOR");
    expect(INTERNAL_STAFF_ROLES).not.toContain("FUND_ADMINISTRATOR");
  });

  it("employer, intermediary, member and provider roles are not internal staff", () => {
    for (const role of ["HR_MANAGER", "BROKER_USER", "MEMBER_USER", "PROVIDER_USER", "FUND_ADMINISTRATOR"] as UserRole[]) {
      expect(INTERNAL_STAFF_ROLES).not.toContain(role);
    }
  });

  it("REPORTS_VIEWER cannot reach claim or money surfaces", () => {
    expect(ROLES.CLAIMS_READ).not.toContain("REPORTS_VIEWER");
    expect(ROLES.CLAIMS_OPS).not.toContain("REPORTS_VIEWER");
    expect(ROLES.MONEY_READ).not.toContain("REPORTS_VIEWER");
  });

  it("INTERNAL_STAFF_ROLES and ROLES.ANY_STAFF are the same set", () => {
    expect(sorted(INTERNAL_STAFF_ROLES)).toEqual(sorted(ROLES.ANY_STAFF));
  });
});

describe("role sets are consistent with the permission grants they stand for", () => {
  it("every role that may read claims actually holds CLAIM:VIEW", () => {
    for (const role of ROLES.CLAIMS_READ) {
      expect(permitted(ROLE_GRANTS[role], "CLAIM:VIEW")).toBe(true);
    }
  });

  it("every role that may work claims holds CLAIM:VIEW", () => {
    for (const role of ROLES.CLAIMS_OPS) {
      expect(permitted(ROLE_GRANTS[role], "CLAIM:VIEW")).toBe(true);
    }
  });

  it("claims work is a subset of claims read", () => {
    for (const role of ROLES.CLAIMS_OPS) {
      expect(ROLES.CLAIMS_READ).toContain(role);
    }
  });

  it("every role that may read money aggregates holds BILLING:VIEW or ANALYTICS:VIEW", () => {
    for (const role of ROLES.MONEY_READ) {
      const grants = ROLE_GRANTS[role];
      expect(
        permitted(grants, "BILLING:VIEW") || permitted(grants, "ANALYTICS:VIEW"),
      ).toBe(true);
    }
  });

  it("deprecated OPS is exactly MEMBER_OPS ∪ CLAIMS_OPS", () => {
    expect(sorted(ROLES.OPS)).toEqual(sorted([...ROLES.MEMBER_OPS, ...ROLES.CLAIMS_OPS]));
  });

  it("rolesWithPermission agrees with the grant table", () => {
    // SUPER_ADMIN holds the wildcard so it appears for every permission.
    expect(rolesWithPermission("CLAIM:ADJUDICATE").sort()).toEqual(
      ["CLAIMS_OFFICER", "SUPER_ADMIN"].sort(),
    );
    expect(rolesWithPermission("CLAIM:VIEW")).not.toContain("CUSTOMER_SERVICE");
  });
});

describe("effective permissions (decision D2-b: baseline ∪ dynamic overlay)", () => {
  it("returns the role baseline when no dynamic assignment exists", () => {
    // This is every production session today — zero UserRoleAssignment rows.
    expect(effectivePermissions("CUSTOMER_SERVICE")).toEqual([...ROLE_GRANTS.CUSTOMER_SERVICE]);
  });

  it("adds dynamic codes without dropping the baseline", () => {
    const eff = effectivePermissions("CUSTOMER_SERVICE", ["SPECIAL:THING"]);
    expect(eff).toContain("SPECIAL:THING");
    expect(eff).toContain("MEMBER:VIEW");
  });

  it("de-duplicates overlapping codes", () => {
    const eff = effectivePermissions("CUSTOMER_SERVICE", ["MEMBER:VIEW"]);
    expect(eff.filter((c) => c === "MEMBER:VIEW")).toHaveLength(1);
  });

  it("the overlay cannot remove a baseline grant", () => {
    expect(effectivePermissions("CUSTOMER_SERVICE", [])).toContain("MEMBER:VIEW");
  });

  it("an unknown or missing role yields no permissions (fail closed)", () => {
    expect(effectivePermissions(null)).toEqual([]);
    expect(effectivePermissions(undefined)).toEqual([]);
    expect(effectivePermissions("NOT_A_ROLE")).toEqual([]);
  });

  it("SUPER_ADMIN's wildcard satisfies any permission", () => {
    expect(permitted(ROLE_GRANTS.SUPER_ADMIN, "ANYTHING:AT_ALL")).toBe(true);
    expect(ROLE_GRANTS.SUPER_ADMIN).toContain(ALL_PERMISSIONS);
  });
});

describe("hasPerm", () => {
  it("falls back to the role baseline when the session carries no permissions", () => {
    const session = { user: { role: "CUSTOMER_SERVICE", permissions: [] } };
    expect(hasPerm(session, "MEMBER:VIEW")).toBe(true);
    expect(hasPerm(session, "CLAIM:VIEW")).toBe(false);
  });

  it("uses the session permissions when present", () => {
    const session = { user: { role: "CUSTOMER_SERVICE", permissions: ["MEMBER:VIEW", "EXTRA:CODE"] } };
    expect(hasPerm(session, "EXTRA:CODE")).toBe(true);
  });

  it("denies with no session", () => {
    expect(hasPerm(null, "MEMBER:VIEW")).toBe(false);
    expect(hasPerm({ user: null }, "MEMBER:VIEW")).toBe(false);
  });
});

describe("no surface re-declares role sets", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

  it("AdminSidebar imports the shared sets instead of restating them", () => {
    const src = read("src/components/layouts/AdminSidebar.tsx");
    expect(src).toContain('from "@/lib/authz/roles"');
    // The exact drift that caused DEF-003: a local array of role literals.
    const localRoleArray = /(?:const|let)\s+\w+\s*(?::\s*UserRole\[\])?\s*=\s*\[\s*"(?:SUPER_ADMIN|CLAIMS_OFFICER|CUSTOMER_SERVICE|FINANCE_OFFICER)"/;
    expect(localRoleArray.test(src)).toBe(false);
  });

  it("tRPC adminProcedure derives its role list from the catalog", () => {
    const src = read("src/server/trpc/trpc.ts");
    expect(src).toContain("INTERNAL_STAFF_ROLES");
    expect(src).not.toMatch(/\[\s*"SUPER_ADMIN",\s*"CLAIMS_OFFICER"/);
  });

  it("the role sets have exactly one definition", () => {
    const roles = read("src/lib/authz/roles.ts");
    const rbac = read("src/lib/rbac.ts");
    expect(roles).toContain("export const ROLES");
    // rbac.ts must re-export, not redefine.
    expect(rbac).not.toContain("export const ROLES = {");
    expect(rbac).toContain("export { ROLES }");
  });
});
