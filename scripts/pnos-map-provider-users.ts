/**
 * PNOS F1.1 — explicit, reviewed mapping of existing provider users to the
 * temporary backward-compatible PROVIDER_LEGACY role.
 *
 * This is deliberately NOT part of seedRbac's auto-migration (which only maps
 * TPA UserRole-enum users). Provider-user role assignment is an explicit,
 * audited action so nobody is silently granted access, and so this can be
 * reviewed before it runs against a real environment.
 *
 * Report-only by default. Pass --apply to create the assignments.
 * Idempotent: an existing active PROVIDER_LEGACY assignment is left untouched.
 *
 *   npx tsx scripts/pnos-map-provider-users.ts               # report
 *   npx tsx scripts/pnos-map-provider-users.ts --apply       # assign
 *   npx tsx scripts/pnos-map-provider-users.ts --tenant <id> # scope to one tenant
 *
 * Requires the PROVIDER_LEGACY role to exist (run the RBAC seed first).
 */
import { prisma } from "@/lib/prisma";

const LEGACY_ROLE_CODE = "PROVIDER_LEGACY";

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArgIdx = process.argv.indexOf("--tenant");
  const tenantFilter = tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : undefined;

  const providerUsers = await prisma.user.findMany({
    where: {
      role: "PROVIDER_USER",
      providerId: { not: null },
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    },
    select: { id: true, email: true, tenantId: true, providerId: true, isActive: true },
    orderBy: [{ tenantId: "asc" }, { email: "asc" }],
  });

  const summary = {
    mode: apply ? "APPLY" : "REPORT",
    scanned: providerUsers.length,
    alreadyAssigned: 0,
    wouldAssign: 0,
    assigned: 0,
    skippedNoRole: 0,
    skippedInactiveUser: 0,
  };

  // Resolve the legacy role per tenant (roles are tenant-scoped).
  const roleByTenant = new Map<string, string>();
  async function legacyRoleId(tenantId: string): Promise<string | null> {
    if (roleByTenant.has(tenantId)) return roleByTenant.get(tenantId)!;
    const role = await prisma.role.findUnique({ where: { tenantId_code: { tenantId, code: LEGACY_ROLE_CODE } } });
    if (role) roleByTenant.set(tenantId, role.id);
    return role?.id ?? null;
  }

  const rows: string[] = [];
  for (const u of providerUsers) {
    const roleId = await legacyRoleId(u.tenantId);
    if (!roleId) {
      summary.skippedNoRole++;
      rows.push(`SKIP(no ${LEGACY_ROLE_CODE} role in tenant ${u.tenantId})  ${u.email}`);
      continue;
    }
    const existing = await prisma.userRoleAssignment.findFirst({
      where: { userId: u.id, roleId, tenantId: u.tenantId, isActive: true, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) {
      summary.alreadyAssigned++;
      rows.push(`HAVE  ${u.email}  (provider ${u.providerId})`);
      continue;
    }
    if (!u.isActive) {
      // Do not grant access to a disabled account; report it for review.
      summary.skippedInactiveUser++;
      rows.push(`SKIP(inactive user)  ${u.email}`);
      continue;
    }
    if (apply) {
      await prisma.userRoleAssignment.create({
        data: {
          userId: u.id, roleId, tenantId: u.tenantId,
          isActive: true, status: "ACTIVE",
          makerId: u.id, checkerId: u.id, // bootstrap migration self-attribution, mirrors seedRbac
          assignedAt: new Date(),
        },
      });
      summary.assigned++;
      rows.push(`ASSIGN ${u.email}  (provider ${u.providerId})`);
    } else {
      summary.wouldAssign++;
      rows.push(`WOULD  ${u.email}  (provider ${u.providerId})`);
    }
  }

  console.log(`\nPNOS F1.1 provider-user → ${LEGACY_ROLE_CODE} mapping`);
  console.log(rows.join("\n") || "(no provider users found)");
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
  if (!apply && summary.wouldAssign > 0) {
    console.log(`\nReport only. Re-run with --apply to create ${summary.wouldAssign} assignment(s).`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
