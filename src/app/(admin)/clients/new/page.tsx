import { requireRole, ROLES } from "@/lib/rbac";
import { ClientsService } from "@/server/services/clients.service";
import { createClientAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const TYPES = [
  { value: "INSURER", label: "Insurer" },
  { value: "HMO", label: "HMO" },
  { value: "EMPLOYER_SELF_FUNDED", label: "Self-funded employer" },
];

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;

  // Active clients are eligible parents (for subsidiary nesting).
  const parents = (await ClientsService.list(session.user.tenantId)).filter(
    (c) => c.status === "ACTIVE",
  );

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-sm font-medium text-brand-text-heading";

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
        <h1 className="text-2xl font-heading font-bold text-brand-text-heading">
          New Client
        </h1>
        <p className="text-sm text-brand-text-muted">
          Register a payer entity Medvex will administer schemes for.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <form
        action={createClientAction}
        className="space-y-5 rounded-lg border border-brand-border bg-brand-bg p-6"
      >
        <div>
          <label className={labelCls} htmlFor="name">
            Client name <span className="text-brand-error">*</span>
          </label>
          <input id="name" name="name" required className={inputCls} placeholder="e.g. Jubilee Insurance Uganda" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="type">
              Type <span className="text-brand-error">*</span>
            </label>
            <select id="type" name="type" required defaultValue="INSURER" className={inputCls}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="currency">
              Currency
            </label>
            <input
              id="currency"
              name="currency"
              defaultValue="UGX"
              maxLength={3}
              className={`${inputCls} uppercase`}
              placeholder="UGX"
            />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="memberNumberPrefix">
            Member-number prefix <span className="text-brand-text-muted">(optional)</span>
          </label>
          <input id="memberNumberPrefix" name="memberNumberPrefix" maxLength={6} className={`${inputCls} uppercase`} placeholder="MVX" />
          <p className="mt-1 text-xs text-brand-text-muted">Member numbers are {"{prefix}"}-{new Date().getFullYear()}-NNNNN. Defaults to MVX.</p>
        </div>

        <div>
          <label className={labelCls} htmlFor="slug">
            Code / slug <span className="text-brand-text-muted">(optional)</span>
          </label>
          <input id="slug" name="slug" className={inputCls} placeholder="auto-generated from name" />
          <p className="mt-1 text-xs text-brand-text-muted">
            Unique per operator. Leave blank to derive from the name.
          </p>
        </div>

        <div>
          <label className={labelCls} htmlFor="parentClientId">
            Parent client <span className="text-brand-text-muted">(optional — for subsidiaries)</span>
          </label>
          <select id="parentClientId" name="parentClientId" defaultValue="" className={inputCls}>
            <option value="">None (top-level client)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/clients"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading"
          >
            Cancel
          </Link>
          <SubmitButton>Create client</SubmitButton>
        </div>
      </form>
    </div>
  );
}
