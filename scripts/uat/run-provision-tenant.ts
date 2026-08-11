/**
 * Idempotent tenant re-provisioning runner (deploy step — plan §13 / PROD-BLOCKER-1).
 *
 * Runs TenantProvisioningService.provisionTenant for the tenant identified by slug
 * (default "medvex"): RBAC catalog + role assignments, default client, chart of
 * accounts, reason codes, override controls, service categories, approval matrix.
 * Every step upserts, so re-running is safe.
 *
 *   DATABASE_URL=… DIRECT_URL=… npx tsx scripts/uat/run-provision-tenant.ts [slug]
 */
import { prisma } from "../../src/lib/prisma";
import { TenantProvisioningService } from "../../src/server/services/tenant-provisioning.service";

async function main() {
  const slug = process.argv[2] ?? "medvex";
  const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Tenant with slug "${slug}" not found.`);
  console.log(`Provisioning tenant ${tenant.name} (${tenant.id})…`);
  const result = await TenantProvisioningService.provisionTenant(tenant.id);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
