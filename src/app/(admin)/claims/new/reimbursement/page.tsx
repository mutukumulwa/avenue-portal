import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ReimbursementClaimForm } from "./ReimbursementClaimForm";
import { MemberClaimHistory } from "@/components/MemberClaimHistory";

export default async function ReimbursementClaimPage({
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
      where: { tenantId },
      select: { id: true, name: true, type: true, county: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/claims/new" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Reimbursement Claim</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">
            Member paid the provider directly. Record the encounter and payment details for reimbursement.
          </p>
        </div>
      </div>

      {memberId && <MemberClaimHistory memberId={memberId} />}

      <ReimbursementClaimForm
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
          county: p.county ?? "",
        }))}
      />
    </div>
  );
}
