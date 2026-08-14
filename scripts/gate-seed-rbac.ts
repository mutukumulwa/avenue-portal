/**
 * UAT-HF P12.04 — give the verification gate's database an RBAC baseline.
 *
 * Step 4b (`rbac-live-drift-check.ts`) compares the code catalogue against what
 * a database actually holds. The gate's database is migrated from empty by step
 * 4, so without this it holds nothing, and 4b reports the entire catalogue as
 * missing: CI run #49 printed `database permissions 0 / tenants checked 0` and
 * 84 drift findings, none of which meant anything.
 *
 * ## What this changes 4b into
 *
 * Two different questions share one script:
 *
 *   * against PRODUCTION (`--release`, real DATABASE_URL) — "does the deployed
 *     database still match the code?" That is the question 4b was written for,
 *     after production was found holding 80 of 84 permissions for SUPER_ADMIN.
 *   * against the GATE database, after this — "does `seedRbac` actually produce
 *     what the catalogue declares?" A freshly seeded database cannot drift
 *     operationally, so any finding is a defect in the seed itself.
 *
 * The second is a weaker question and a real one. It catches the same class one
 * layer earlier: the SUPER_ADMIN incident happened because a seed run created
 * `Permission` rows and some grants but not others, and nothing compared the
 * result to the catalogue.
 *
 * ## Deliberately minimal
 *
 * One tenant and `seedRbac`. 4b reads `Permission` (global), `Role` per tenant
 * and `RolePermission` per tenant/role — it never looks at members, claims,
 * contracts or the chart of accounts, so seeding those would cost gate time to
 * check nothing. Idempotent: every write is an upsert.
 *
 * ## It refuses to run anywhere but the gate's own database
 *
 * This script CREATES a tenant. Pointed at production it would put a "gate"
 * tenant in it. So it runs only when `DATABASE_URL` is exactly the throwaway
 * the workflow stood up — the same guard shape the autopilot integration tests
 * use, and the reason they cannot touch a real database either.
 */

const gateUrl = process.env.GATE_DATABASE_URL ?? "";
const url = process.env.DATABASE_URL ?? "";

if (!gateUrl || !url || gateUrl !== url) {
  console.error(
    "gate-seed-rbac refuses to run: DATABASE_URL must be exactly GATE_DATABASE_URL.\n" +
      "  This script creates a tenant and seeds RBAC. That is safe against the gate's\n" +
      "  throwaway database and is not safe anywhere else, so it will not guess.",
  );
  process.exit(1);
}

const SLUG = "gate";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const { seedRbac } = await import("../prisma/seeds/rbac");

  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Verification Gate", slug: SLUG },
    });

    await seedRbac(prisma, tenant.id);

    const [permissions, roles, grants] = await Promise.all([
      prisma.permission.count(),
      prisma.role.count({ where: { tenantId: tenant.id } }),
      prisma.rolePermission.count(),
    ]);
    console.log(
      `\n  seeded tenant "${SLUG}": ${permissions} permissions, ${roles} roles, ${grants} grants\n`,
    );

    // A silent no-op here would leave 4b reporting the whole catalogue as drift
    // and reading like a product defect, which is exactly what this replaces.
    if (permissions === 0 || roles === 0 || grants === 0) {
      throw new Error("seedRbac wrote nothing — step 4b would report the entire catalogue as drift.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
