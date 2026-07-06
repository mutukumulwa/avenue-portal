import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ProvidersTable } from "./ProvidersTable";
import { Pagination } from "@/components/ui/Pagination";

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number((await searchParams).page) || 1);

  // Fetch one page of rows; keep the tier stat cards accurate across the whole
  // network via a grouped count rather than counting the current page only.
  const [providers, total, tierGroups] = await Promise.all([
    prisma.provider.findMany({
      where: { tenantId },
      include: { _count: { select: { claims: true } } },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.provider.count({ where: { tenantId } }),
    prisma.provider.groupBy({ by: ["tier"], where: { tenantId }, _count: true }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const tierCount = (t: string) => tierGroups.find((g) => g.tier === t)?._count ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Healthcare Providers</h1>
          <p className="text-brand-text-body font-body mt-1">Manage contracted facilities and provider network.</p>
        </div>
        <Link href="/providers/new" className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm">
          <PlusCircle size={18} />
          <span>Add Provider</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Medvex Own",        count: tierCount("OWN"),     color: "text-brand-indigo" },
          { label: "Partner Facilities", count: tierCount("PARTNER"), color: "text-[#28A745]"    },
          { label: "Panel Providers",   count: tierCount("PANEL"),   color: "text-[#17A2B8]"    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-brand-text-muted font-bold uppercase">{s.label}</p>
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
      <Pagination page={page} totalPages={totalPages} total={total} params={{}} basePath="/providers" unit="providers" />
    </div>
  );
}
