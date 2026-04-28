import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function BrokerSubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { brokerId: true } });
  if (!user?.brokerId) redirect("/broker/submissions");

  const { id } = await params;
  const endorsement = await prisma.endorsement.findFirst({
    where: { id, tenantId: session.user.tenantId, group: { brokerId: user.brokerId } },
    include: { group: { select: { name: true } }, member: { select: { firstName: true, lastName: true, memberNumber: true } } },
  });
  if (!endorsement) notFound();

  const details = endorsement.changeDetails as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/broker/submissions" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">{endorsement.endorsementNumber}</h1>
          <p className="text-sm text-avenue-text-muted mt-1">{endorsement.group.name} · {endorsement.type.replace(/_/g, " ")}</p>
        </div>
      </div>
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-3">
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div><span className="text-avenue-text-muted">Status</span><p className="font-bold text-avenue-text-heading">{endorsement.status.replace(/_/g, " ")}</p></div>
          <div><span className="text-avenue-text-muted">Effective Date</span><p className="font-bold text-avenue-text-heading">{new Date(endorsement.effectiveDate).toLocaleDateString("en-KE")}</p></div>
          <div><span className="text-avenue-text-muted">Member</span><p className="font-bold text-avenue-text-heading">{endorsement.member ? `${endorsement.member.firstName} ${endorsement.member.lastName}` : "Not linked"}</p></div>
          <div><span className="text-avenue-text-muted">Pro-Rata</span><p className="font-bold text-avenue-text-heading">KES {Number(endorsement.proratedAmount ?? 0).toLocaleString()}</p></div>
        </div>
        {details && (
          <pre className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-md p-3 text-xs overflow-x-auto">
            {JSON.stringify(details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
