import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { updateClientAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const TYPES = [
  { value: "INSURER", label: "Insurer" },
  { value: "HMO", label: "HMO" },
  { value: "EMPLOYER_SELF_FUNDED", label: "Self-funded employer" },
];
const STATUSES = ["PROSPECT", "ACTIVE", "SUSPENDED", "TERMINATED"];

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { id } = await params;
  const { error } = await searchParams;

  const client = await ClientsService.getById(session.user.tenantId, id);
  if (!client) notFound();

  // Eligible parents = other active clients (cannot parent itself).
  const parents = (await ClientsService.list(session.user.tenantId)).filter(
    (c) => c.status === "ACTIVE" && c.id !== id,
  );

  const action = updateClientAction.bind(null, id);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-sm font-medium text-brand-text-heading";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to client
      </Link>

      <h1 className="text-2xl font-heading font-bold text-brand-text-heading">
        Edit {client.name}
      </h1>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <form
        action={action}
        className="space-y-5 rounded-lg border border-brand-border bg-brand-bg p-6"
      >
        <div>
          <label className={labelCls} htmlFor="name">
            Client name <span className="text-brand-error">*</span>
          </label>
          <input id="name" name="name" required defaultValue={client.name} className={inputCls} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls} htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={client.type} className={inputCls}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="currency">Currency</label>
            <input id="currency" name="currency" defaultValue={client.currency} maxLength={3} className={`${inputCls} uppercase`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={client.status} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="parentClientId">
            Parent client <span className="text-brand-text-muted">(optional)</span>
          </label>
          <select id="parentClientId" name="parentClientId" defaultValue={client.parentClient?.id ?? ""} className={inputCls}>
            <option value="">None (top-level client)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/clients/${id}`}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading"
          >
            Cancel
          </Link>
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>
    </div>
  );
}
