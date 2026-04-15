import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ProvidersTable } from "./ProvidersTable";

export default async function ProvidersPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const providers = await prisma.provider.findMany({
    where: { tenantId: session.user.tenantId },
    include: { _count: { select: { claims: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Healthcare Providers</h1>
          <p className="text-avenue-text-body font-body mt-1">Manage contracted facilities and provider network.</p>
        </div>
        <Link href="/providers/new" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm">
          <PlusCircle size={18} />
          <span>Add Provider</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Avenue Own",        count: providers.filter(p => p.tier === "OWN").length,     color: "text-avenue-indigo" },
          { label: "Partner Facilities", count: providers.filter(p => p.tier === "PARTNER").length, color: "text-[#28A745]"    },
          { label: "Panel Providers",   count: providers.filter(p => p.tier === "PANEL").length,   color: "text-[#17A2B8]"    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      <ProvidersTable
        providers={providers.map(p => ({
          id:             p.id,
          name:           p.name,
          type:           p.type,
          tier:           p.tier,
          county:         p.county,
          phone:          p.phone,
          contractStatus: p.contractStatus,
          claimCount:     p._count.claims,
        }))}
      />
    </div>
  );
}
