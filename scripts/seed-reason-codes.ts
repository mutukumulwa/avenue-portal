import { prisma } from "@/lib/prisma";
import { ReasonCodeService } from "@/server/services/reason-codes.service";

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const n = await ReasonCodeService.seedForTenant(t.id);
    console.log(`Seeded ${n} reason codes for tenant ${t.name} (${t.id})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
