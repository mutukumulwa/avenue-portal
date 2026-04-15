import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { GroupsService } from "@/server/services/groups.service";
import { GroupEditForm } from "./GroupEditForm";

export default async function GroupEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const group = await GroupsService.getGroupById(session.user.tenantId, id);
  if (!group) notFound();

  // Serialize for the client component
  const serialized = {
    id: group.id,
    name: group.name,
    industry: group.industry,
    registrationNumber: group.registrationNumber,
    address: (group as { address?: string | null }).address ?? null,
    county: (group as { county?: string | null }).county ?? null,
    contactPersonName: group.contactPersonName,
    contactPersonPhone: group.contactPersonPhone,
    contactPersonEmail: group.contactPersonEmail,
    paymentFrequency: group.paymentFrequency,
    effectiveDate: group.effectiveDate.toISOString(),
    renewalDate: group.renewalDate.toISOString(),
    status: group.status,
    notes: (group as { notes?: string | null }).notes ?? null,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/groups/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Edit Group</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">{group.name}</p>
        </div>
      </div>
      <GroupEditForm group={serialized} />
    </div>
  );
}
