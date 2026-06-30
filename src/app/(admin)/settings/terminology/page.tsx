import { requireRole, ROLES } from "@/lib/rbac";
import { TerminologyService } from "@/server/services/terminology.service";
import { ClientsService } from "@/server/services/clients.service";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createTermAction, submitTermAction, approveTermAction, rejectTermAction } from "./actions";
import { Languages } from "lucide-react";

const SCOPES = ["SYSTEM", "HOUSE", "CLIENT", "LOCALE"];

const statusBadge = (s: string) => {
  switch (s) {
    case "APPROVED": return "bg-brand-success/10 text-brand-success";
    case "PENDING_APPROVAL": return "bg-brand-info/10 text-brand-info";
    case "REJECTED": return "bg-brand-pink/15 text-brand-error";
    default: return "bg-brand-text-muted/10 text-brand-text-muted";
  }
};

export default async function TerminologyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;

  const [entries, clients] = await Promise.all([
    TerminologyService.list(session.user.tenantId),
    ClientsService.list(session.user.tenantId),
  ]);
  const pending = entries.filter((e) => e.status === "PENDING_APPROVAL");

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-medium text-brand-text-heading";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Languages className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Terminology</h1>
          <p className="text-sm text-brand-text-muted">
            Per-client vocabulary. Enums stay canonical in code; display text
            resolves CLIENT → LOCALE → HOUSE → SYSTEM. Maker-checker approved.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {/* New term */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-brand-text-muted">Add term</h2>
        <form action={createTermAction} className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="scope">Scope</label>
            <select id="scope" name="scope" defaultValue="HOUSE" className={inputCls}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="clientId">Client (CLIENT scope)</label>
            <select id="clientId" name="clientId" defaultValue="" className={inputCls}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="locale">Locale (LOCALE scope)</label>
            <input id="locale" name="locale" placeholder="e.g. lg-UG" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="key">Key</label>
            <input id="key" name="key" required placeholder="policy" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="displayText">Display text</label>
            <input id="displayText" name="displayText" required placeholder="Cover" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="context">Context (optional)</label>
            <input id="context" name="context" className={inputCls} />
          </div>
          <div className="col-span-2 flex justify-end lg:col-span-3">
            <SubmitButton>Save draft</SubmitButton>
          </div>
        </form>
      </section>

      {/* Approval queue */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">
          Approval queue ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-brand-text-muted">Nothing pending approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-bg px-4 py-3"
              >
                <div className="text-sm">
                  <span className="font-medium text-brand-text-heading">{e.key}</span>
                  <span className="text-brand-text-muted"> → </span>
                  <span className="text-brand-text-body">{e.displayText}</span>
                  <span className="ml-2 text-xs text-brand-text-muted">
                    {e.scope}{e.client ? ` · ${e.client.name}` : ""}{e.locale ? ` · ${e.locale}` : ""}
                  </span>
                </div>
                <div className="flex gap-2">
                  <form action={approveTermAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="rounded-full bg-brand-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                      Approve
                    </button>
                  </form>
                  <form action={rejectTermAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-error hover:bg-brand-bg-alt">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All entries */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">
          All terms ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No terms yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Key → display</th>
                  <th className="px-4 py-2.5 font-semibold">Scope</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-brand-bg-alt/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-brand-text-heading">{e.key}</span>
                      <span className="text-brand-text-muted"> → </span>
                      <span className="text-brand-text-body">{e.displayText}</span>
                      {!e.isActive && <span className="ml-2 text-xs text-brand-text-muted">(superseded)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-brand-text-body">
                      {e.scope}{e.client ? ` · ${e.client.name}` : ""}{e.locale ? ` · ${e.locale}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {(e.status === "DRAFT" || e.status === "REJECTED") && (
                        <form action={submitTermAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="text-xs font-semibold text-brand-secondary hover:underline">
                            Submit for approval
                          </button>
                        </form>
                      )}
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
