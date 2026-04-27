import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CardManagementPanel } from "./CardManagementPanel";

export default async function MemberCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id }  = await params;

  const member = await prisma.member.findUnique({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      memberNumber: true,
      smartCardNumber: true,
      activityLogs: {
        where: { action: { in: ["CARD_ISSUED", "CARD_REISSUED", "CARD_REPLACEMENT_REQUESTED"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, action: true, description: true, createdAt: true },
      },
    },
  });
  if (!member) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/members/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">
            Smart Card — {member.firstName} {member.lastName}
          </h1>
          <p className="text-avenue-text-body text-sm mt-0.5 font-mono">{member.memberNumber}</p>
        </div>
      </div>

      <CardManagementPanel
        memberId={member.id}
        currentCardNumber={member.smartCardNumber ?? null}
        activityLogs={member.activityLogs.map(l => ({
          id: l.id,
          action: l.action,
          description: l.description,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
