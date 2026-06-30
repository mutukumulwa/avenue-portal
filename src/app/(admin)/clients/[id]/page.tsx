import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { ArrowLeft, Pencil, Building2, Network } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const TYPE_LABEL: Record<string, string> = {
  INSURER: "Insurer",
  HMO: "HMO",
  EMPLOYER_SELF_FUNDED: "Self-funded employer",
};

const statusBadge = (s: string) => {
  switch (s) {
    case "ACTIVE":
      return "bg-brand-success/10 text-brand-success";
    case "PROSPECT":
      return "bg-brand-info/10 text-brand-info";
    case "SUSPENDED":
      return "bg-brand-pink/15 text-brand-error";
    default:
      return "bg-brand-text-muted/10 text-brand-text-muted";
  }
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;
  const client = await ClientsService.getById(session.user.tenantId, id);
  if (!client) notFound();

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <dt className="text-xs uppercase text-brand-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-brand-text-heading">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">
              {client.name}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(
                client.status,
              )}`}
            >
              {client.status}
            </span>
          </div>
          <p className="text-sm text-brand-text-muted">
            {TYPE_LABEL[client.type] ?? client.type} · {client.slug}
          </p>
        </div>
        <Link
          href={`/clients/${client.id}/edit`}
          className="inline-flex items-center gap-2 rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-brand-text-heading transition-colors hover:bg-brand-bg-alt"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-5 rounded-lg border border-brand-border bg-brand-bg p-6 sm:grid-cols-4">
        <Field label="Type" value={TYPE_LABEL[client.type] ?? client.type} />
        <Field label="Currency" value={client.currency} />
        <Field
          label="Parent client"
          value={
            client.parentClient ? (
              <Link
                href={`/clients/${client.parentClient.id}`}
                className="text-brand-secondary hover:underline"
              >
                {client.parentClient.name}
              </Link>
            ) : (
              "— (top-level)"
            )
          }
        />
        <Field
          label="Subsidiaries"
          value={client.subsidiaries.length}
        />
      </dl>

      {/* Subsidiaries */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-brand-text-muted">
          <Network className="h-4 w-4" /> Subsidiaries ({client.subsidiaries.length})
        </h2>
        {client.subsidiaries.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No subsidiary clients.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-brand-border">
                {client.subsidiaries.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clients/${s.id}`}
                        className="font-medium text-brand-secondary hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-brand-text-body">{s.currency}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(
                          s.status,
                        )}`}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Schemes */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-brand-text-muted">
          <Building2 className="h-4 w-4" /> Schemes ({client.groups.length})
        </h2>
        {client.groups.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No schemes under this client yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-brand-border">
                {client.groups.map((g) => (
                  <tr key={g.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/groups/${g.id}`}
                        className="font-medium text-brand-secondary hover:underline"
                      >
                        {g.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right text-brand-text-body">
                      {g.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
