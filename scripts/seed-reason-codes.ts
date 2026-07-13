// Provision reference data for existing tenants (idempotent). Pass one or more
// tenant ids to target them; with no args, provisions every tenant. Useful for
// repairing tenants that predate a catalog.
//   npx tsx --env-file=.env scripts/seed-reason-codes.ts [tenantId ...]
import { prisma } from "@/lib/prisma";
import { TenantProvisioningService } from "@/server/services/tenant-provisioning.service";

async function main() {
  const argIds = process.argv.slice(2);
  const tenants = argIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: argIds } }, select: { id: true, name: true } })
    : await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const { reasonCodes, overrideControls, serviceCategories } = await TenantProvisioningService.provisionTenant(t.id);
    console.log(`Provisioned tenant ${t.name} (${t.id}): ${reasonCodes} reason codes + ${overrideControls} override controls + ${serviceCategories} service categories`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
