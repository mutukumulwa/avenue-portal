import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { ClientForm } from "../../ClientForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;

  const client = await ClientsService.getById(session.user.tenantId, id);
  if (!client) notFound();

  // D8 — currency is locked once the client has any downstream activity.
  const currencyLocked = await ClientsService.hasFinancialActivity(session.user.tenantId, id);

  // Eligible parents = other active clients (cannot parent itself).
  const parents = (await ClientsService.list(session.user.tenantId))
    .filter((c) => c.status === "ACTIVE" && c.id !== id)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to client
      </Link>

      <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Edit {client.name}</h1>

      <ClientForm
        client={{
          id: client.id,
          name: client.name,
          type: client.type,
          currency: client.currency,
          status: client.status,
          slug: client.slug,
          memberNumberPrefix: client.memberNumberPrefix,
          parentClientId: client.parentClient?.id ?? null,
        }}
        parents={parents}
        currencyLocked={currencyLocked}
      />
    </div>
  );
}
