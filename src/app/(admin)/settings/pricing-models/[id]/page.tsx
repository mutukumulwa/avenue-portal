import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileSpreadsheet, Settings } from "lucide-react";
import { RateTableEditor } from "./RateTableEditor";

export default async function PricingModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;

  const model = await prisma.pricingModel.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      rateTables: {
        orderBy: [{ minAge: "asc" }, { gender: "asc" }, { familySize: "asc" }],
      },
      _count: { select: { quotations: true } },
    },
  });

  if (!model) return notFound();

  // Convert Decimal to number for the client component
  const initialData = model.rateTables.map(rt => ({
    id: rt.id,
    minAge: rt.minAge,
    maxAge: rt.maxAge,
    gender: rt.gender,
    familySize: rt.familySize,
    baseRate: Number(rt.baseRate),
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Link href="/settings/pricing-models" className="inline-flex items-center text-sm font-bold text-brand-text-muted hover:text-brand-indigo transition-colors">
        <ChevronLeft size={16} className="mr-1" />
        Back to Pricing Models
      </Link>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded bg-[#0B1437]/10 text-brand-indigo flex items-center justify-center shrink-0">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{model.name}</h1>
              <span className={`text-xs px-2 py-1 rounded font-bold ${model.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {model.isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <p className="text-brand-text-body font-body">
              {model.description || `Type: ${model.type.replace('_', ' ')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-brand-text-muted">
          <div className="flex items-center gap-1">
            <Settings size={16} />
            <span>Used in {model._count.quotations} quotes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {model.type === "AGE_BANDED" ? (
          <RateTableEditor pricingModelId={model.id} initialData={initialData} />
        ) : (
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-8 text-center">
            <h2 className="text-lg font-bold text-brand-text-heading mb-2">Unsupported Editor Type</h2>
            <p className="text-brand-text-muted">
              Inline editing is currently only supported for AGE_BANDED models. 
              This model is of type {model.type}. Please use the legacy JSON parameters editor.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
