import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Grid3X3, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * D-03: Family-size × benefit-limit rate matrix admin.
 * Groups FamilySizeMatrixCell records by rateCardId — each card is
 * a named pricing table assignable to a package or scheme.
 */

async function createRateCardAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const { prisma } = await import("@/lib/prisma");
  const session = await requireRole(ROLES.UNDERWRITING);
  const name = formData.get("name") as string;
  if (!name) throw new Error("Rate card name is required");

  // The rateCardId is just the slugified name — no separate table needed
  const rateCardId = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const tenantId = session.user.tenantId;

  // Seed one placeholder row so the card appears in the list
  await prisma.familySizeMatrixCell.create({
    data: {
      tenantId,
      rateCardId,
      familySize:       "M",
      benefitLimitBand: "1000000",
      contributionAmount: 0,
      effectiveFrom:    new Date(),
      isActive:         false,  // placeholder — not active until rows are configured
    },
  });

  const { redirect } = await import("next/navigation");
  redirect(`/packages/rate-matrix/${rateCardId}`);
}

export default async function RateMatrixListPage() {
  const session = await requireRole(ROLES.UNDERWRITING);

  const cards = await prisma.familySizeMatrixCell.groupBy({
    by: ["rateCardId"],
    where: { tenantId: session.user.tenantId },
    _count: { _all: true },
    _min: { effectiveFrom: true },
    orderBy: { rateCardId: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <Grid3X3 size={22} className="text-brand-indigo" />
            Rate Matrix Library
          </h1>
          <p className="text-brand-text-muted text-sm mt-1">
            Family-size × benefit-limit contribution rate tables. Assign to packages or schemes at quotation time.
          </p>
        </div>

        <form action={createRateCardAction} className="flex gap-2 items-center">
          <input name="name" type="text" required placeholder="New rate card name"
            className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
          <button type="submit"
            className="bg-brand-indigo text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-1.5">
            <Plus size={14} /> New Rate Card
          </button>
        </form>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <Grid3X3 size={32} className="mx-auto mb-3 text-brand-text-muted opacity-30" />
          <p className="text-brand-text-muted text-sm">No rate cards yet. Create one above.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Rate Card ID</th>
                <th className="px-5 py-3 text-center">Cells</th>
                <th className="px-5 py-3">Effective From</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {cards.map((c) => (
                <tr key={c.rateCardId} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-mono font-semibold text-brand-text-heading">{c.rateCardId}</td>
                  <td className="px-5 py-3 text-center text-brand-text-muted">{c._count._all}</td>
                  <td className="px-5 py-3 text-brand-text-muted text-xs">
                    {c._min.effectiveFrom ? new Date(c._min.effectiveFrom).toLocaleDateString("en-UG") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/packages/rate-matrix/${c.rateCardId}`}
                      className="text-brand-indigo hover:text-brand-secondary font-semibold text-xs inline-flex items-center gap-1">
                      Edit <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
