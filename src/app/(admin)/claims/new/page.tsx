import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ProvidersService } from "@/server/services/providers.service";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ClaimForm } from "./ClaimForm";
import { MemberClaimHistory } from "@/components/MemberClaimHistory";

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { memberId } = await searchParams;

  const tenantId = session.user.tenantId;

  const [members, providers] = await Promise.all([
    prisma.member.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        id: true, firstName: true, lastName: true, memberNumber: true,
        group: { select: { name: true } },
        package: { select: { name: true } },
      },
      orderBy: [{ group: { name: "asc" } }, { firstName: "asc" }],
    }),
    prisma.provider.findMany({
      // PR-006: only operational providers are selectable for new encounters.
      where: ProvidersService.operationalWhere(tenantId),
      select: { id: true, name: true, type: true, tier: true, county: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // PR-007: active branches per provider power the optional branch selector.
  const branchRows = await prisma.providerBranch.findMany({
    where: { tenantId, isActive: true, providerId: { in: providers.map((p) => p.id) } },
    select: { id: true, name: true, code: true, providerId: true },
    orderBy: { name: "asc" },
  });
  const branchesByProvider: Record<string, { id: string; name: string; code: string | null }[]> = {};
  for (const b of branchRows) {
    (branchesByProvider[b.providerId] ??= []).push({ id: b.id, name: b.name, code: b.code });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/claims" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Submit New Claim</h1>
          <p className="text-brand-text-body text-sm mt-0.5">Log a medical encounter with individual service line items.</p>
        </div>
      </div>

      {memberId && <MemberClaimHistory memberId={memberId} />}

      <ClaimForm
        members={members.map(m => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          memberNumber: m.memberNumber,
          group: m.group.name,
          package: m.package.name,
        }))}
        providers={providers.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          tier: p.tier,
          county: p.county ?? "",
        }))}
        branchesByProvider={branchesByProvider}
      />
    </div>
  );
}
