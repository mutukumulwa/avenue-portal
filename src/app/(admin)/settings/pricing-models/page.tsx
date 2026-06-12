import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileSpreadsheet, Activity, AlertTriangle } from "lucide-react";
import { CreateModelModal } from "./CreateModelModal";

export default async function PricingModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { error } = await searchParams;

  const models = await prisma.pricingModel.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { rateTables: true, quotations: true } },
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {error && (
        <div className="flex items-center gap-3 bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg px-4 py-3">
          <AlertTriangle size={18} className="text-[#856404] shrink-0" />
          <p className="text-sm font-semibold text-[#856404] flex-1">
            {error}
          </p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Pricing Models</h1>
          <p className="text-avenue-text-body font-body mt-1">
            Manage contribution rate tables and pricing algorithms.
          </p>
        </div>
        <CreateModelModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {models.map((model) => (
          <Link
            key={model.id}
            href={`/settings/pricing-models/${model.id}`}
            className="block border border-[#EEEEEE] rounded-lg p-5 bg-white hover:shadow-md hover:border-avenue-indigo/30 transition-all group"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="w-10 h-10 rounded bg-[#292A83]/10 text-avenue-indigo flex items-center justify-center">
                <FileSpreadsheet size={20} />
              </div>
              <span className={`text-xs px-2 py-1 rounded font-bold ${model.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {model.isActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            
            <h3 className="font-bold text-lg text-avenue-text-heading group-hover:text-avenue-indigo transition-colors mb-1">
              {model.name}
            </h3>
            <p className="text-sm text-avenue-text-body mb-4 h-10 line-clamp-2">
              {model.description || `A ${model.type.toLowerCase().replace('_', ' ')} pricing model.`}
            </p>

            <div className="grid grid-cols-2 gap-4 border-t border-[#EEEEEE] pt-4 text-sm">
              <div>
                <p className="text-avenue-text-muted text-xs uppercase font-bold tracking-wider mb-1">Rates</p>
                <p className="font-medium text-avenue-text-heading">{model._count.rateTables} entries</p>
              </div>
              <div>
                <p className="text-avenue-text-muted text-xs uppercase font-bold tracking-wider mb-1">Usage</p>
                <p className="font-medium text-avenue-text-heading">{model._count.quotations} quotes</p>
              </div>
            </div>
          </Link>
        ))}

        {models.length === 0 && (
          <div className="col-span-full py-12 text-center text-avenue-text-muted border-2 border-dashed border-[#EEEEEE] rounded-lg">
            <Activity size={48} className="mx-auto mb-4 opacity-20" />
            <p>No pricing models found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
