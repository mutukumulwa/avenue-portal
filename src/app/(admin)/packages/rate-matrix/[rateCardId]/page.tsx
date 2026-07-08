import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";

const FAMILY_SIZES = ["M", "M+1", "M+2", "M+3", "M+4", "M+5", "M+6", "M+7", "M+7+"];

async function upsertCellAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const { prisma } = await import("@/lib/prisma");
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId      = session.user.tenantId;
  const rateCardId    = formData.get("rateCardId") as string;
  const familySize    = formData.get("familySize") as string;
  const limitBand     = formData.get("limitBand") as string;
  const amount        = Number(formData.get("amount"));
  const effectiveFrom = new Date(formData.get("effectiveFrom") as string);
  const cellId        = (formData.get("cellId") as string) || null;

  if (cellId) {
    await prisma.familySizeMatrixCell.update({
      where: { id: cellId },
      data: { contributionAmount: amount, effectiveFrom, isActive: true },
    });
  } else {
    await prisma.familySizeMatrixCell.create({
      data: { tenantId, rateCardId, familySize, benefitLimitBand: limitBand, contributionAmount: amount, effectiveFrom, isActive: true },
    });
  }
  revalidatePath(`/packages/rate-matrix/${rateCardId}`);
}

async function deleteCellAction(formData: FormData) {
  "use server";
  await (await import("@/lib/rbac")).requireRole((await import("@/lib/rbac")).ROLES.UNDERWRITING);
  const { prisma } = await import("@/lib/prisma");
  const cellId     = formData.get("cellId") as string;
  const rateCardId = formData.get("rateCardId") as string;
  await prisma.familySizeMatrixCell.update({ where: { id: cellId }, data: { isActive: false, effectiveTo: new Date() } });
  revalidatePath(`/packages/rate-matrix/${rateCardId}`);
}

async function addRowAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const { prisma } = await import("@/lib/prisma");
  const session     = await requireRole(ROLES.UNDERWRITING);
  const rateCardId  = formData.get("rateCardId") as string;
  const limitBand   = (formData.get("limitBand") as string).replace(/,/g, "");
  const effectiveFrom = new Date(formData.get("effectiveFrom") as string || Date.now());

  // Create a cell for each family size at KES 0 — staff fills in amounts
  const SIZES = ["M","M+1","M+2","M+3","M+4","M+5","M+6","M+7","M+7+"];
  await prisma.familySizeMatrixCell.createMany({
    data: SIZES.map((fs) => ({
      tenantId: session.user.tenantId, rateCardId, familySize: fs,
      benefitLimitBand: limitBand, contributionAmount: 0, effectiveFrom, isActive: false,
    })),
    skipDuplicates: true,
  });
  revalidatePath(`/packages/rate-matrix/${rateCardId}`);
}

export default async function RateMatrixDetailPage({ params }: { params: Promise<{ rateCardId: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { rateCardId } = await params;
  const tenantId = session.user.tenantId;

  const cells = await prisma.familySizeMatrixCell.findMany({
    where: { tenantId, rateCardId },
    orderBy: [{ benefitLimitBand: "asc" }, { familySize: "asc" }],
  });

  // Group by limit band for matrix display
  const bands = [...new Set(cells.map((c) => c.benefitLimitBand))].sort((a, b) => Number(a) - Number(b));

  const matrix: Record<string, Record<string, typeof cells[0] | null>> = {};
  for (const band of bands) {
    matrix[band] = {};
    for (const fs of FAMILY_SIZES) {
      matrix[band][fs] = cells.find((c) => c.benefitLimitBand === band && c.familySize === fs) ?? null;
    }
  }

  const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/packages/rate-matrix" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brand-text-heading font-heading font-mono">{rateCardId}</h1>
            <p className="text-brand-text-muted text-sm mt-0.5">{cells.length} cells · {bands.length} benefit limit bands</p>
          </div>
        </div>
      </div>

      {/* Add new benefit limit band row */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4">
        <h2 className="font-semibold text-brand-text-heading text-sm mb-3">Add Benefit Limit Band</h2>
        <form action={addRowAction} className="flex gap-3 items-end">
          <input type="hidden" name="rateCardId" value={rateCardId} />
          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1">Limit Band (UGX)</label>
            <input name="limitBand" type="text" required placeholder="e.g. 1000000"
              className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm font-mono w-36 focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-text-muted mb-1">Effective From</label>
            <input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().split("T")[0]}
              className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
          </div>
          <button type="submit"
            className="bg-brand-indigo text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-1.5">
            <Plus size={14} /> Add Band
          </button>
        </form>
        <p className="text-xs text-brand-text-muted mt-2">Creates a row for all 9 family sizes at KES 0. Fill in amounts below.</p>
      </div>

      {/* Matrix table */}
      {bands.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-10 text-center text-brand-text-muted text-sm">
          Add a benefit limit band above to start building the matrix.
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-x-auto">
          <table className="text-sm text-left min-w-full">
            <thead>
              <tr className="bg-[#E6E7E8] border-b border-[#EEEEEE]">
                <th className="px-4 py-3 text-xs font-semibold text-[#6C757D]">Limit Band (UGX)</th>
                {FAMILY_SIZES.map((fs) => (
                  <th key={fs} className="px-3 py-3 text-xs font-semibold text-brand-indigo text-center">{fs}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {bands.map((band) => (
                <tr key={band} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5 font-mono text-sm font-semibold text-brand-text-heading">
                    {fmt(Number(band))}
                  </td>
                  {FAMILY_SIZES.map((fs) => {
                    const cell = matrix[band][fs];
                    return (
                      <td key={fs} className="px-2 py-1.5 text-center">
                        {cell ? (
                          <form action={upsertCellAction} className="flex items-center gap-1">
                            <input type="hidden" name="rateCardId" value={rateCardId} />
                            <input type="hidden" name="cellId" value={cell.id} />
                            <input type="hidden" name="familySize" value={fs} />
                            <input type="hidden" name="limitBand" value={band} />
                            <input type="hidden" name="effectiveFrom" value={cell.effectiveFrom.toISOString().split("T")[0]} />
                            <input name="amount" type="number" min="0" step="100"
                              defaultValue={Number(cell.contributionAmount)}
                              className={`w-24 border rounded px-2 py-1 text-xs text-right font-mono focus:ring-1 focus:ring-brand-indigo focus:outline-none ${!cell.isActive ? "border-[#FFC107]/60 bg-[#FFF8E1]" : "border-[#EEEEEE]"}`}
                            />
                            <button type="submit" className="text-brand-indigo hover:text-brand-secondary transition-colors" title="Save">
                              <Save size={12} />
                            </button>
                          </form>
                        ) : (
                          <form action={upsertCellAction}>
                            <input type="hidden" name="rateCardId" value={rateCardId} />
                            <input type="hidden" name="familySize" value={fs} />
                            <input type="hidden" name="limitBand" value={band} />
                            <input type="hidden" name="effectiveFrom" value={new Date().toISOString().split("T")[0]} />
                            <input name="amount" type="number" min="0" step="100" defaultValue={0}
                              className="w-24 border border-dashed border-[#EEEEEE] rounded px-2 py-1 text-xs text-right font-mono bg-[#F8F9FA]" />
                            <button type="submit" className="text-[#28A745] hover:opacity-70 ml-1" title="Add">
                              <Plus size={11} />
                            </button>
                          </form>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-brand-text-muted">
        Yellow cells are inactive (amount = 0 or not confirmed). Click <Save size={10} className="inline" /> to save individual cells.
        This matrix is referenced when building quotations with <strong>FAMILY_MATRIX</strong> pricing mode.
      </p>
    </div>
  );
}
