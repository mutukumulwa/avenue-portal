import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createAutoAdjPolicyAction, deactivateAutoAdjPolicyAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Zap } from "lucide-react";

export default async function AutoAdjudicationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [clients, policies, recent] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenantId: tenantId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.autoAdjudicationPolicy.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }],
      include: { client: { select: { name: true } } },
    }),
    prisma.claim.findMany({
      where: { tenantId, autoAdjDecision: { not: null } },
      orderBy: { autoAdjudicatedAt: "desc" },
      take: 15,
      select: {
        id: true, claimNumber: true, autoAdjDecision: true, autoAdjFailingGate: true,
        autoAdjudicatedAt: true, billedAmount: true, currency: true,
      },
    }),
  ]);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Auto-Adjudication</h1>
          <p className="text-sm text-brand-text-muted">
            Clean, low-risk claims that pass every deterministic gate auto-approve without a
            human touch; everything else routes to review with the failing gate named. A
            client-specific policy overrides the operator default.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Set a policy (supersedes the scope&rsquo;s current one)</h2>
        <form action={createAutoAdjPolicyAction} className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="clientId">Scope</label>
            <select id="clientId" name="clientId" className={inputCls} defaultValue="">
              <option value="">Operator default (all clients)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="maxAutoApproveAmount">Auto-approve ceiling (empty = none)</label>
            <div className="flex gap-2">
              <input id="maxAutoApproveAmount" name="maxAutoApproveAmount" type="number" min="0" step="0.01" className={inputCls} placeholder="500000" />
              <select name="currency" className={`${inputCls} w-28`} defaultValue="UGX">
                <option value="UGX">UGX</option>
                <option value="USD">USD</option>
                <option value="KES">KES</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-text-body">
            <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4" />
            Auto-adjudication enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-text-body">
            <input type="checkbox" name="requireCleanFraud" defaultChecked className="h-4 w-4" />
            Require no open fraud alert
          </label>
          <div className="col-span-2 flex justify-end">
            <SubmitButton>Save policy</SubmitButton>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Scope</th>
              <th className="px-4 py-2.5">Enabled</th>
              <th className="px-4 py-2.5">Ceiling</th>
              <th className="px-4 py-2.5">Clean fraud</th>
              <th className="px-4 py-2.5">Effective</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {policies.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-muted">No policies — the conservative built-in default applies (auto-approve clean claims, no ceiling).</td></tr>
            ) : policies.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-medium text-brand-text-heading">{p.client?.name ?? "Operator default"}</td>
                <td className="px-4 py-2.5">{p.enabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2.5 font-mono">{p.maxAutoApproveAmount != null ? `${Number(p.maxAutoApproveAmount).toLocaleString()} ${p.currency}` : "—"}</td>
                <td className="px-4 py-2.5">{p.requireCleanFraud ? "Required" : "Not required"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{new Date(p.effectiveFrom).toLocaleDateString("en-UG")}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.isActive ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {p.isActive ? "Active" : "Superseded"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {p.isActive && (
                    <form action={deactivateAutoAdjPolicyAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-xs font-semibold text-brand-error hover:underline">Deactivate</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Recent decisions</h2>
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Claim</th>
              <th className="px-4 py-2.5">Decision</th>
              <th className="px-4 py-2.5">Failing gate</th>
              <th className="px-4 py-2.5">Billed</th>
              <th className="px-4 py-2.5">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {recent.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-muted">No auto-adjudicated claims yet.</td></tr>
            ) : recent.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 font-medium text-brand-text-heading">{c.claimNumber}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.autoAdjDecision === "AUTO_APPROVE" ? "bg-brand-success/10 text-brand-success" : "bg-[#FFC107]/15 text-[#856404]"}`}>
                    {c.autoAdjDecision === "AUTO_APPROVE" ? "Auto-approved" : "Routed"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-brand-text-body">{c.autoAdjFailingGate ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono">{Number(c.billedAmount).toLocaleString()} {c.currency}</td>
                <td className="px-4 py-2.5 text-brand-text-muted">{c.autoAdjudicatedAt ? new Date(c.autoAdjudicatedAt).toLocaleString("en-UG") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
