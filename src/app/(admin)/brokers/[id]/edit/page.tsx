import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { BrokerForm } from "../../BrokerForm";

export default async function EditBrokerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;
  const broker = await prisma.broker.findUnique({ where: { id, tenantId: session.user.tenantId } });
  if (!broker) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/brokers/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Edit Broker</h1>
          <p className="text-sm text-avenue-text-muted mt-1">{broker.name}</p>
        </div>
      </div>
      <BrokerForm
        broker={{
          id: broker.id,
          name: broker.name,
          contactPerson: broker.contactPerson,
          phone: broker.phone,
          email: broker.email,
          address: broker.address,
          licenseNumber: broker.licenseNumber,
          status: broker.status,
          firstYearCommissionPct: Number(broker.firstYearCommissionPct),
          renewalCommissionPct: Number(broker.renewalCommissionPct),
          flatFeePerMember: broker.flatFeePerMember === null ? null : Number(broker.flatFeePerMember),
        }}
      />
    </div>
  );
}
