/**
 * UAT-HF P12.04d — layer (c): what the code says versus what the database holds.
 *
 * `scripts/rbac-drift-check.mjs` reads source only, deliberately: a check that
 * needs a database connection to report a typo is a check nobody runs, and it
 * belongs at pre-push where the defect is created. But a static check cannot
 * see the thing that actually bit.
 *
 * On 2026-08-14, production held **80 of 84** permissions for SUPER_ADMIN. The
 * four missing were exactly the four added that day — so the seed run that
 * created their `Permission` rows AND their CUSTOMER_SERVICE/UNDERWRITER grants
 * did not extend SUPER_ADMIN's, though the same loop covers it. Nothing in the
 * source was wrong. Only the database disagreed with it, and no check looked.
 *
 * That instance was harmless — `ROLE_GRANTS` gives SUPER_ADMIN `"*"` and
 * `permitted()` matches the wildcard. The next one will not be, because the
 * wildcard is the only reason it did not matter.
 *
 * ## Read-only. Always.
 *
 * It never writes. `--sql` PRINTS remediation statements for a person to read,
 * decide on, and run. An auto-fixing RBAC tool is one bad diff away from
 * granting permissions nobody approved, and the whole point of this file is
 * that the database is where the surprises live.
 *
 * ## What it compares
 *
 *   1. Permission rows          code catalogue ⇄ database (global table)
 *   2. Roles, per tenant        ROLE_CODES ⇄ that tenant's roles
 *   3. Grants, per tenant/role  ROLE_PERMISSIONS ⇄ RolePermission
 *
 * `Permission.code` is globally unique with no tenant; `Role` is unique per
 * (tenantId, code). So grants are compared tenant by tenant — a tenant
 * provisioned before a permission existed lacks its grants, and that is exactly
 * the shape of the defect above.
 *
 * Run:
 *   npx tsx scripts/rbac-live-drift-check.ts            # report
 *   npx tsx scripts/rbac-live-drift-check.ts --sql      # + remediation SQL
 *   npx tsx scripts/rbac-live-drift-check.ts --release  # non-zero on drift
 */

/**
 * The comparison, as a pure function.
 *
 * Separated from the database access deliberately: this step only runs in
 * `--release`, so without a pure core its logic would be exercised roughly
 * never — and a drift checker whose own comparison is untested is a poor joke.
 * `main()` below does the I/O and calls this.
 */
type Finding = {
  severity: "DRIFT" | "NOTE";
  what: string;
  detail: string;
  /** Remediation. PRINTED, never executed. Absent when the fix needs a decision. */
  sql?: string;
};

/** Single-quote escaping for the printed SQL. Values here are code constants. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function computeDrift(input: {
  codePermissions: { code: string; module: string; action: string; resource: string; description: string }[];
  dbPermissions: { id: string; code: string }[];
  roleCodes: readonly string[];
  rolePermissions: Record<string, string[]>;
  tenants: {
    slug: string;
    roles: { id: string; code: string; permissionCodes: string[] }[];
  }[];
}): Finding[] {
  const out: Finding[] = [];
  const codeByCode = new Map(input.codePermissions.map((p) => [p.code, p]));
  const dbByCode = new Map(input.dbPermissions.map((p) => [p.code, p.id]));

  for (const [code, p] of codeByCode) {
    if (dbByCode.has(code)) continue;
    out.push({
      severity: "DRIFT",
      what: `permission missing from the database: ${code}`,
      detail:
        "The seed defines it and the database does not have it. Every grant referencing it is " +
        "silently skipped — seedRbac does `if (!permission) continue` — so the role bundles that " +
        "mention it are quietly incomplete.",
      sql:
        `INSERT INTO "Permission" (id, code, module, action, resource, description) VALUES ` +
        `(gen_random_uuid()::text, ${q(code)}, ${q(p.module)}, ${q(p.action)}, ${q(p.resource)}, ${q(p.description)});`,
    });
  }

  for (const [code, id] of dbByCode) {
    if (codeByCode.has(code)) continue;
    out.push({
      severity: "DRIFT",
      what: `permission in the database that the code does not define: ${code}`,
      detail:
        "Usually a code removed from the catalogue without its rows being deleted. Seeds are " +
        "ADDITIVE — dropping a code stops it being recreated and deletes nothing — so the static " +
        "check goes green while the rows live on in every environment.",
      sql:
        `DELETE FROM "RolePermission" WHERE "permissionId" = ${q(id)};\n` +
        `  DELETE FROM "Permission" WHERE id = ${q(id)};`,
    });
  }

  for (const tenant of input.tenants) {
    const byCode = new Map(tenant.roles.map((r) => [r.code, r]));

    for (const roleCode of input.roleCodes) {
      const role = byCode.get(roleCode);
      if (!role) {
        out.push({
          severity: "DRIFT",
          what: `[${tenant.slug}] role missing: ${roleCode}`,
          detail:
            "The tenant was provisioned before this role existed, or provisioning did not " +
            "complete. Nobody can be assigned it.",
        });
        continue;
      }

      const want = new Set(input.rolePermissions[roleCode] ?? []);
      const have = new Set(role.permissionCodes);

      // Only codes the database actually has: a grant for a permission that
      // does not exist is already reported above, and repeating it per role
      // would bury the one finding under fifty.
      const missing = [...want].filter((c) => !have.has(c) && dbByCode.has(c));
      if (missing.length > 0) {
        out.push({
          severity: "DRIFT",
          what: `[${tenant.slug}] ${roleCode} is missing ${missing.length} grant(s)`,
          detail: missing.sort().join(", "),
          sql: missing
            .map(
              (c) =>
                `INSERT INTO "RolePermission" ("roleId","permissionId","grantedById") ` +
                `SELECT ${q(role.id)}, p.id, 'system' FROM "Permission" p WHERE p.code = ${q(c)} ` +
                `ON CONFLICT DO NOTHING;`,
            )
            .join("\n  "),
        });
      }

      const extra = [...have].filter((c) => !want.has(c));
      if (extra.length > 0) {
        out.push({
          severity: "DRIFT",
          what: `[${tenant.slug}] ${roleCode} holds ${extra.length} grant(s) the code does not give it`,
          detail:
            `${extra.sort().join(", ")}\n      ` +
            "Either the seed should grant these — add them and this resolves — or the rows are " +
            "stale. The admin UI is revoke-only (DEC-16), so nothing in the product creates them.",
        });
      }
    }

    for (const role of tenant.roles) {
      if (input.roleCodes.includes(role.code)) continue;
      out.push({
        severity: "NOTE",
        what: `[${tenant.slug}] role in the database that the code does not define: ${role.code}`,
        detail:
          "Not automatically wrong — it may predate ROLE_CODES. But nothing seeds or maintains " +
          "it, so its grants will never be updated again.",
      });
    }
  }

  return out;
}


/**
 * I/O only. Everything decision-shaped lives in computeDrift above.
 *
 * The Prisma client is created HERE rather than at module scope: a module-level
 * `process.exit` on a missing DATABASE_URL would kill any test that imports
 * computeDrift, which is the whole reason that function was split out.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. This check reads a database by definition.");
    process.exit(2);
  }

  const wantSql = process.argv.includes("--sql");
  const release = process.argv.includes("--release");

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const { PERMISSIONS, ROLE_PERMISSIONS, ROLE_CODES } = await import("../prisma/seeds/rbac");

  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

  try {
    const dbPermissions = await prisma.permission.findMany({ select: { id: true, code: true } });
    const byId = new Map(dbPermissions.map((p) => [p.id, p.code]));

    const tenantRows = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    const tenants = [];
    for (const t of tenantRows) {
      const roles = await prisma.role.findMany({
        where: { tenantId: t.id },
        select: { id: true, code: true, permissions: { select: { permissionId: true } } },
      });
      tenants.push({
        slug: t.slug,
        roles: roles.map((r) => ({
          id: r.id,
          code: r.code,
          permissionCodes: r.permissions
            .map((rp) => byId.get(rp.permissionId))
            .filter((c): c is string => Boolean(c)),
        })),
      });
    }

    const findings = computeDrift({
      codePermissions: PERMISSIONS,
      dbPermissions,
      roleCodes: ROLE_CODES,
      rolePermissions: ROLE_PERMISSIONS,
      tenants,
    });

    const drift = findings.filter((f) => f.severity === "DRIFT");
    const notes = findings.filter((f) => f.severity === "NOTE");

    console.log("\nRBAC live drift — code versus database\n");
    console.log(`  catalogue permissions   ${PERMISSIONS.length}`);
    console.log(`  database permissions    ${dbPermissions.length}`);
    console.log(`  tenants checked         ${tenants.length}`);

    if (findings.length === 0) {
      console.log("\n  No drift. The database holds exactly what the seed says it should.\n");
      return 0;
    }

    for (const [label, list] of [
      ["drift", drift],
      ["notes", notes],
    ] as const) {
      if (list.length === 0) continue;
      console.log(`\n  ${list.length} ${label}:\n`);
      for (const f of list) {
        console.log(`    • ${f.what}`);
        console.log(`      ${f.detail}\n`);
      }
    }

    if (wantSql) {
      const withSql = drift.filter((f) => f.sql);
      if (withSql.length === 0) {
        console.log("  (no remediation SQL — these findings need a decision, not a statement)\n");
      } else {
        console.log("  ── Remediation SQL — READ IT, then run it yourself ──\n");
        console.log("  BEGIN;\n");
        for (const f of withSql) console.log(`  -- ${f.what}\n  ${f.sql}\n`);
        console.log("  COMMIT;\n");
      }
    } else if (drift.length > 0) {
      console.log("  Re-run with --sql to print remediation statements.\n");
    }

    // Notes alone never fail: this must not become a check people route around.
    return release && drift.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly, so a test can import computeDrift in peace.
if (process.argv[1]?.includes("rbac-live-drift-check")) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("rbac-live-drift-check failed:", err);
      process.exit(2);
    });
}
