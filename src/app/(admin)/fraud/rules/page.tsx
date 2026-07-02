import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { upsertFraudRuleAction, toggleFraudRuleAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ShieldAlert } from "lucide-react";

const KNOWN_CODES = [
  { code: "UPCODING", hint: '{"variancePct": 20}' },
  { code: "HIGH_FREQUENCY", hint: '{"maxClaims": 5, "windowDays": 30}' },
  { code: "IDENTITY_SHARING", hint: '{"maxProvidersPerDay": 2}' },
  { code: "PHANTOM_BILLING", hint: '{"maxProviderClaimsPerDay": 30}' },
];

export default async function FraudRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [clients, rules] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenantId: tenantId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.fraudRule.findMany({
      where: { tenantId },
      orderBy: [{ enabled: "desc" }, { code: "asc" }],
      include: { client: { select: { name: true } } },
    }),
  ]);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Fraud Rules</h1>
          <p className="text-sm text-brand-text-muted">
            Configurable typology rules applied by the periodic fraud scan. A client-specific
            rule overrides the operator default of the same code. Thresholds live in the JSON config.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Set a rule</h2>
        <form action={upsertFraudRuleAction} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="code">Code</label>
            <input id="code" name="code" required className={inputCls} placeholder="UPCODING" list="fraud-codes" />
            <datalist id="fraud-codes">
              {KNOWN_CODES.map((k) => <option key={k.code} value={k.code} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls} htmlFor="name">Name</label>
            <input id="name" name="name" required className={inputCls} placeholder="Upcoding vs contracted rate" />
          </div>
          <div>
            <label className={labelCls} htmlFor="clientId">Scope</label>
            <select id="clientId" name="clientId" className={inputCls} defaultValue="">
              <option value="">Operator default (all clients)</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="weight">Weight (1–10; ≥3 medium, ≥5 high)</label>
            <input id="weight" name="weight" type="number" min="1" max="10" defaultValue="3" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="config">Config (JSON thresholds)</label>
            <input id="config" name="config" className={`${inputCls} font-mono`} placeholder='{"variancePct": 20}' />
            <p className="mt-1 text-xs text-brand-text-muted">
              Known configs: {KNOWN_CODES.map((k) => `${k.code} ${k.hint}`).join(" · ")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-text-body">
            <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4" />
            Enabled
          </label>
          <div className="flex justify-end">
            <SubmitButton>Save rule</SubmitButton>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Scope</th>
              <th className="px-4 py-2.5">Weight</th>
              <th className="px-4 py-2.5">Config</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {rules.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-muted">No configurable rules yet — only the built-in intake heuristics run.</td></tr>
            ) : rules.map((r) => (
              <tr key={r.id} className={r.enabled ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-mono font-medium text-brand-text-heading">{r.code}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{r.name}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{r.client?.name ?? "Operator default"}</td>
                <td className="px-4 py-2.5">{r.weight}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-brand-text-muted">{JSON.stringify(r.config)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.enabled ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {r.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <form action={toggleFraudRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs font-semibold text-brand-indigo hover:underline">
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
