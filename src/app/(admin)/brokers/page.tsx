import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PlusCircle } from "lucide-react";
import { BrokersTable } from "./BrokersTable";

export default async function BrokersPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const brokers = await prisma.broker.findMany({
    where: { tenantId: session.user.tenantId },
    include: { _count: { select: { groups: true, commissions: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Brokers</h1>
          <p className="text-avenue-text-body font-body mt-1">Manage broker partners and their commission structures.</p>
        </div>
        <button className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm">
          <PlusCircle size={18} />
          <span>Add Broker</span>
        </button>
      </div>

      <BrokersTable
        brokers={brokers.map(b => ({
          id:                     b.id,
          name:                   b.name,
          licenseNumber:          b.licenseNumber,
          contactPerson:          b.contactPerson,
          phone:                  b.phone,
          firstYearCommissionPct: Number(b.firstYearCommissionPct),
          renewalCommissionPct:   Number(b.renewalCommissionPct),
          status:                 b.status,
          groupCount:             b._count.groups,
        }))}
      />
    </div>
  );
}
