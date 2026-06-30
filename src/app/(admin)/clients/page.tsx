import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { PlusCircle, Landmark, ChevronRight } from "lucide-react";
import Link from "next/link";

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

export default async function ClientsPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const clients = await ClientsService.list(session.user.tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">
            Clients
          </h1>
          <p className="text-sm text-brand-text-muted">
            Payer entities (insurers, HMOs, self-funded employers) whose schemes
            Medvex administers.
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-indigo-hover"
        >
          <PlusCircle className="h-4 w-4" />
          New Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-brand-border bg-brand-bg p-12 text-center">
          <Landmark className="mx-auto h-10 w-10 text-brand-text-muted" />
          <p className="mt-3 text-sm text-brand-text-muted">
            No clients yet. Create your first payer client to start onboarding
            its schemes.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Currency</th>
                <th className="px-4 py-3 font-semibold">Schemes</th>
                <th className="px-4 py-3 font-semibold">Parent</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-brand-bg-alt/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-text-heading">
                      {c.name}
                    </div>
                    <div className="text-xs text-brand-text-muted">{c.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-text-body">
                    {TYPE_LABEL[c.type] ?? c.type}
                  </td>
                  <td className="px-4 py-3 text-brand-text-body">{c.currency}</td>
                  <td className="px-4 py-3 text-brand-text-body">
                    {c._count.groups}
                  </td>
                  <td className="px-4 py-3 text-brand-text-body">
                    {c.parentClient?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(
                        c.status,
                      )}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-brand-text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
