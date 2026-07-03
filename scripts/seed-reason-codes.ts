import { prisma } from "@/lib/prisma";
import { ReasonCodeService } from "@/server/services/reason-codes.service";
import { OverrideControlService } from "@/server/services/override-control.service";
import { ServiceCategoryService } from "@/server/services/service-category.service";

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const n = await ReasonCodeService.seedForTenant(t.id);
    const oc = await OverrideControlService.seedForTenant(t.id);
    const sc = await ServiceCategoryService.seedForTenant(t.id);
    console.log(`Seeded ${n} reason codes + ${oc} override controls + ${sc} service categories for tenant ${t.name} (${t.id})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
