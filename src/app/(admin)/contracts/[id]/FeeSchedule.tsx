import { prisma } from "@/lib/prisma";
import { FeeScheduleTabs, type FeeLine, type TierGroups } from "./FeeScheduleTabs";

/**
 * Server side of the tier-grouped fee schedule (WP-E3): fetches the
 * contract's active tariff lines, resolves each line's effective tier
 * (own category tier, else nearest ancestor's), and groups for the tabs.
 * Unmapped lines land in OTHER and are counted for the data-quality chip.
 */
export async function FeeSchedule({ tenantId, contractId }: { tenantId: string; contractId: string }) {
  const [lines, categories] = await Promise.all([
    prisma.providerTariff.findMany({
      where: { contractId, isActive: true },
      select: {
        id: true,
        cptCode: true,
        providerServiceCode: true,
        serviceName: true,
        rateType: true,
        agreedRate: true,
        discountPct: true,
        currency: true,
        unitOfMeasure: true,
        requiresPreauth: true,
        rateMissing: true,
        serviceCategoryId: true,
      },
      orderBy: { serviceName: "asc" },
    }),
    prisma.serviceCategory.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, tier: true },
    }),
  ]);

  // Effective tier resolution in memory (children inherit ancestors, WP-E1).
  const byId = new Map(categories.map((c) => [c.id, c]));
  const tierOf = (categoryId: string | null): string | null => {
    let current = categoryId ? byId.get(categoryId) : undefined;
    let guard = 0;
    while (current && guard++ < 10) {
      if (current.tier) return current.tier;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };

  const groups: TierGroups = {};
  let unmappedCount = 0;
  for (const l of lines) {
    const tier = tierOf(l.serviceCategoryId) ?? "OTHER";
    if (!l.serviceCategoryId) unmappedCount++;
    const fee: FeeLine = {
      id: l.id,
      code: l.providerServiceCode ?? l.cptCode,
      name: l.serviceName,
      rateType: l.rateType,
      rate: l.agreedRate != null ? Number(l.agreedRate) : null,
      discountPct: l.discountPct != null ? Number(l.discountPct) : null,
      currency: l.currency,
      unitOfMeasure: l.unitOfMeasure,
      requiresPreauth: l.requiresPreauth,
      rateMissing: l.rateMissing,
    };
    (groups[tier] ??= []).push(fee);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#000523] mb-3">Fee schedule</h2>
      <FeeScheduleTabs groups={groups} unmappedCount={unmappedCount} />
    </section>
  );
}
