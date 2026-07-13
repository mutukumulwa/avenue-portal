/**
 * backfill-tariff-categories.ts (WP-E2 wiring)
 *
 * Two jobs, per tenant, idempotent:
 *   1. Seed the canonical service-category taxonomy (ServiceCategoryService).
 *   2. Assign serviceCategoryId to existing ACTIVE tariff lines that are still
 *      unmapped, via ServiceCategoryService.categoryCodeForTariff (provider-code
 *      prefix, then service-name keywords).
 *
 * Lines the resolver can't place confidently are left unmapped — they keep
 * rendering in the fee schedule's "Other" bucket rather than being mis-bucketed.
 *
 * Idempotent: only touches lines with serviceCategoryId IS NULL.
 *
 * Usage: npx tsx --env-file=.env scripts/backfill-tariff-categories.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";
import { ServiceCategoryService } from "@/server/services/service-category.service";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let grandMapped = 0;
  let grandUnmapped = 0;

  for (const t of tenants) {
    const seeded = await ServiceCategoryService.seedForTenant(t.id);
    const codeMap = await ServiceCategoryService.tenantCategoryIdByCode(t.id);

    const lines = await prisma.providerTariff.findMany({
      where: { serviceCategoryId: null, isActive: true, contract: { tenantId: t.id } },
      select: { id: true, providerServiceCode: true, cptCode: true, serviceName: true },
    });

    const idsByCategory = new Map<string, string[]>();
    const countByCode: Record<string, number> = {};
    let unmapped = 0;

    for (const l of lines) {
      const code = ServiceCategoryService.categoryCodeForTariff(l);
      const categoryId = code ? codeMap.get(code) ?? null : null;
      if (!code || !categoryId) {
        unmapped++;
        continue;
      }
      countByCode[code] = (countByCode[code] ?? 0) + 1;
      const bucket = idsByCategory.get(categoryId);
      if (bucket) bucket.push(l.id);
      else idsByCategory.set(categoryId, [l.id]);
    }

    let mapped = 0;
    for (const [categoryId, ids] of idsByCategory) {
      mapped += ids.length;
      if (!dryRun) {
        for (let i = 0; i < ids.length; i += 1000) {
          await prisma.providerTariff.updateMany({
            where: { id: { in: ids.slice(i, i + 1000) } },
            data: { serviceCategoryId: categoryId },
          });
        }
      }
    }

    grandMapped += mapped;
    grandUnmapped += unmapped;
    console.log(
      `[${t.name}] taxonomy=${seeded} cats · ${lines.length} unmapped lines → ${dryRun ? "would map" : "mapped"} ${mapped}, left ${unmapped}`,
    );
    for (const [code, n] of Object.entries(countByCode).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${code.padEnd(26)} ${n}`);
    }
  }

  console.log(
    `\n${dryRun ? "DRY-RUN — no writes made." : "Done."} Total ${dryRun ? "mappable" : "mapped"}=${grandMapped}, left unmapped=${grandUnmapped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
