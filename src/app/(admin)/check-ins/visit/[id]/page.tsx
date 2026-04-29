import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";

export default async function VisitVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const visit = await prisma.visitVerification.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      provider: { select: { name: true } },
      confirmedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!visit) notFound();

  return (
    <div className="rounded-lg border border-[#EEEEEE] bg-white p-6">
      <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Visit Verification Opened</h1>
      <dl className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase text-avenue-text-muted">Member</dt>
          <dd className="font-bold text-avenue-text-heading">{visit.member.firstName} {visit.member.lastName} - {visit.member.memberNumber}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-avenue-text-muted">Facility</dt>
          <dd className="font-bold text-avenue-text-heading">{visit.provider.name}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-avenue-text-muted">Flow</dt>
          <dd className="font-bold text-avenue-text-heading">{visit.flow.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-avenue-text-muted">Opened</dt>
          <dd className="font-bold text-avenue-text-heading">{visit.openedAt.toLocaleString()}</dd>
        </div>
      </dl>
      {visit.reviewRequired && (
        <p className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-avenue-error">
          This visit is flagged for check-in audit review.
        </p>
      )}
    </div>
  );
}
