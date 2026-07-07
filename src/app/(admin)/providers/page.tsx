import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ProvidersTable } from "./ProvidersTable";
import { Pagination } from "@/components/ui/Pagination";

const PROVIDER_TYPES = ["HOSPITAL", "CLINIC", "PHARMACY", "LABORATORY", "DENTAL", "OPTICAL", "REHABILITATION"] as const;
const PROVIDER_TIERS = ["OWN", "PARTNER", "PANEL"] as const;

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;
  const PAGE_SIZE = 50;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  // PR-V01: search the WHOLE network server-side. The search box previously
  // filtered only the current page's rows client-side, so facilities on other
  // pages (e.g. Nakasero, IHK) never matched. Name/county/phone match by
  // substring; type/tier match when the query is a substring of an enum value
  // (so "hospital" or "panel" work too).
  const where: Prisma.ProviderWhereInput = { tenantId };
  if (q) {
    const upper = q.toUpperCase();
    const typeMatches = PROVIDER_TYPES.filter((t) => t.includes(upper));
    const tierMatches = PROVIDER_TIERS.filter((t) => t.includes(upper));
    where.OR = [
      { name:   { contains: q, mode: "insensitive" } },
      { county: { contains: q, mode: "insensitive" } },
      { phone:  { contains: q } },
      ...(typeMatches.length ? [{ type: { in: [...typeMatches] } }] : []),
      ...(tierMatches.length ? [{ tier: { in: [...tierMatches] } }] : []),
    ];
  }

  // Fetch one page of rows; keep the tier stat cards accurate across the whole
  // network via a grouped count rather than counting the current page only.
  const [providers, total, tierGroups] = await Promise.all([
    prisma.provider.findMany({
      where,
      include: { _count: { select: { claims: true } } },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.provider.count({ where }),
    // Stat cards reflect the whole network, not the filtered view.
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
        initialQuery={q}
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
      <Pagination page={page} totalPages={totalPages} total={total} params={q ? { q } : {}} basePath="/providers" unit="providers" />
    </div>
  );
}
