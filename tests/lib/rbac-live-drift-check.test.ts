import { describe, it, expect } from "vitest";
import { computeDrift } from "../../scripts/rbac-live-drift-check";

/**
 * UAT-HF P12.04d — layer (c) of the RBAC drift check.
 *
 * The static check (`scripts/rbac-drift-check.mjs`) reads source and belongs at
 * pre-push. It cannot see a database that disagrees with perfectly correct
 * code — which is exactly what production did on 2026-08-14: SUPER_ADMIN held
 * **80 of 84** permissions, the four missing being the four added that day.
 * Nothing in the source was wrong. Only the database was, and no check looked.
 *
 * The comparison is a pure function precisely so it can be tested here: the
 * gate step that uses it runs only in `--release` with a database, so without
 * these its logic would be exercised roughly never — and a drift checker whose
 * own comparison is untested is a poor joke.
 */

const perm = (code: string) => ({
  code,
  module: "M",
  action: "A",
  resource: "R",
  description: `d:${code}`,
});

/** Everything agreeing: one permission, one role, one grant. */
const base = () => ({
  codePermissions: [perm("A:READ")],
  dbPermissions: [{ id: "p1", code: "A:READ" }],
  roleCodes: ["CLERK"] as readonly string[],
  rolePermissions: { CLERK: ["A:READ"] },
  tenants: [{ slug: "medvex", roles: [{ id: "r1", code: "CLERK", permissionCodes: ["A:READ"] }] }],
});

describe("agreement is silent", () => {
  it("finds nothing when the database matches the seed", () => {
    expect(computeDrift(base())).toEqual([]);
  });

  it("says nothing about a permission the code defines and every role correctly lacks", () => {
    // Not this check's job — that is the STATIC check's "held by nobody" case.
    // Reporting it here too would double every finding.
    const input = base();
    input.codePermissions.push(perm("B:READ"));
    input.dbPermissions.push({ id: "p2", code: "B:READ" });
    expect(computeDrift(input)).toEqual([]);
  });
});

describe("the production case: a role missing grants the seed gives it", () => {
  it("is reported, with the codes named", () => {
    const input = base();
    input.rolePermissions.CLERK = ["A:READ", "B:READ"];
    input.codePermissions.push(perm("B:READ"));
    input.dbPermissions.push({ id: "p2", code: "B:READ" });

    const [f] = computeDrift(input);
    expect(f.what).toMatch(/\[medvex\] CLERK is missing 1 grant/);
    expect(f.detail).toBe("B:READ");
  });

  it("offers remediation SQL naming the role by id", () => {
    const input = base();
    input.rolePermissions.CLERK = ["A:READ", "B:READ"];
    input.codePermissions.push(perm("B:READ"));
    input.dbPermissions.push({ id: "p2", code: "B:READ" });

    const [f] = computeDrift(input);
    expect(f.sql).toContain(`'r1'`);
    expect(f.sql).toContain(`'B:READ'`);
    // Idempotent: a person may run it twice, or race the seed.
    expect(f.sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("does NOT report a missing grant whose permission is absent from the database", () => {
    // That is already one finding ("permission missing from the database").
    // Repeating it once per role would bury the real one under fifty.
    const input = base();
    input.rolePermissions.CLERK = ["A:READ", "GHOST:READ"];
    input.codePermissions.push(perm("GHOST:READ"));

    const findings = computeDrift(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].what).toMatch(/permission missing from the database: GHOST:READ/);
  });
});

describe("a role holding more than the code gives it", () => {
  it("is reported", () => {
    // Real, in production: CUSTOMER_SERVICE held four grants the seed does not
    // give it, and UNDERWRITER two. Over-permissioning nobody approved.
    const input = base();
    input.dbPermissions.push({ id: "p2", code: "B:READ" });
    input.codePermissions.push(perm("B:READ"));
    input.tenants[0].roles[0].permissionCodes = ["A:READ", "B:READ"];

    const [f] = computeDrift(input);
    expect(f.what).toMatch(/CLERK holds 1 grant\(s\) the code does not give it/);
    expect(f.detail).toMatch(/B:READ/);
  });

  it("offers NO SQL, because the fix is a decision", () => {
    // Delete the row, or add it to the seed? Only a person knows. Printing a
    // DELETE would make revoking access the default answer.
    const input = base();
    input.dbPermissions.push({ id: "p2", code: "B:READ" });
    input.codePermissions.push(perm("B:READ"));
    input.tenants[0].roles[0].permissionCodes = ["A:READ", "B:READ"];
    expect(computeDrift(input)[0].sql).toBeUndefined();
  });
});

describe("the permission table itself", () => {
  it("reports a code the seed defines and the database lacks", () => {
    const input = base();
    input.codePermissions.push(perm("B:READ"));
    const [f] = computeDrift(input);
    expect(f.what).toMatch(/permission missing from the database: B:READ/);
    // seedRbac does `if (!permission) continue`, so grants naming it vanish.
    expect(f.detail).toMatch(/silently skipped/);
    expect(f.sql).toMatch(/INSERT INTO "Permission"/);
  });

  it("reports a row the code no longer defines — the two-part-job trap", () => {
    // Removing a code from the catalogue stops the seed RECREATING it and
    // deletes nothing. The static check goes green while rows live on.
    const input = base();
    input.dbPermissions.push({ id: "ghost", code: "GHOST:CODE" });
    const [f] = computeDrift(input);
    expect(f.what).toMatch(/permission in the database that the code does not define: GHOST:CODE/);
    expect(f.detail).toMatch(/ADDITIVE/);
    // Grants first, then the permission — the other order violates the FK.
    expect(f.sql!.indexOf('DELETE FROM "RolePermission"')).toBeLessThan(
      f.sql!.indexOf('DELETE FROM "Permission"'),
    );
  });
});

describe("roles", () => {
  it("reports a role the seed defines that a tenant does not have", () => {
    const input = base();
    input.roleCodes = ["CLERK", "MANAGER"];
    const [f] = computeDrift(input);
    expect(f.what).toMatch(/\[medvex\] role missing: MANAGER/);
    expect(f.severity).toBe("DRIFT");
  });

  it("treats an unknown role in the database as a NOTE, not drift", () => {
    // It may predate ROLE_CODES. Failing a release over it would teach people
    // to route around the check; saying nothing would hide that its grants are
    // now unmaintained.
    const input = base();
    input.tenants[0].roles.push({ id: "r2", code: "LEGACY", permissionCodes: [] });
    const [f] = computeDrift(input);
    expect(f.severity).toBe("NOTE");
    expect(f.what).toMatch(/role in the database that the code does not define: LEGACY/);
  });
});

describe("multi-tenancy", () => {
  it("checks each tenant separately, and labels which one", () => {
    // Permission is global; Role is unique per (tenantId, code). A tenant
    // provisioned before a permission existed lacks its grants — which is the
    // exact shape of the defect that prompted this file.
    const input = base();
    input.tenants.push({
      slug: "second",
      roles: [{ id: "r9", code: "CLERK", permissionCodes: [] }],
    });
    const findings = computeDrift(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].what).toMatch(/^\[second\]/);
  });
});

describe("SQL escaping", () => {
  it("escapes a quote in a description rather than emitting broken SQL", () => {
    const input = base();
    input.codePermissions.push({
      code: "B:READ",
      module: "M",
      action: "A",
      resource: "R",
      description: "a member's record",
    });
    const [f] = computeDrift(input);
    expect(f.sql).toContain("a member''s record");
  });
});
