import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { ClientForm } from "../ClientForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function NewClientPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  // Active clients are eligible parents (for subsidiary nesting).
  const parents = (await ClientsService.list(session.user.tenantId))
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      <div>
        <h1 className="text-2xl font-heading font-bold text-brand-text-heading">New Client</h1>
        <p className="text-sm text-brand-text-muted">
          Register a payer entity Medvex will administer schemes for.
        </p>
      </div>

      <ClientForm parents={parents} />
    </div>
  );
}
