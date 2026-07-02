import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  createAdminFeeAgreementAction,
  endAdminFeeAgreementAction,
  runAccrualNowAction,
  invoiceAccruedAction,
} from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Landmark } from "lucide-react";

const METHOD_LABEL: Record<string, string> = {
  PMPM: "PMPM (per member per month)",
  FLAT_PER_INSURED: "Flat per insured",
  PCT_OF_CLAIMS: "% of claims paid",
  CASE_MGMT: "Case management (per case)",
  PREAUTH: "Pre-auth (per request)",
  CROSS_BORDER: "Cross-border (per case)",
  CARD_ISSUANCE: "Card issuance",
  CARD_REPLACEMENT: "Card replacement",
};

export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const [clients, agreements, ledger] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenantId: tenantId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.adminFeeAgreement.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { name: true } } },
    }),
    prisma.adminFeeLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { client: { select: { name: true } } },
    }),
  ]);

  const accruedTotal = ledger.filter((e) => e.status === "ACCRUED").reduce((s, e) => s + Number(e.amount), 0);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="h-6 w-6 text-brand-secondary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">TPA Admin Fees</h1>
            <p className="text-sm text-brand-text-muted">
              The operator&rsquo;s revenue line: fee agreements per client, the accrual ledger
              (system of record), and invoicing. Recurring methods accrue daily by job.
            </p>
          </div>
        </div>
        <form action={runAccrualNowAction}>
          <SubmitButton>Run accrual now</SubmitButton>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">New agreement</h2>
          <form action={createAdminFeeAgreementAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="clientId">Client</label>
              <select id="clientId" name="clientId" className={inputCls} defaultValue="">
                <option value="">All clients (operator default)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="method">Method</label>
              <select id="method" name="method" required className={inputCls} defaultValue="PMPM">
                {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelCls} htmlFor="rate">Rate / %</label>
                <input id="rate" name="rate" type="number" min="0" step="0.01" required className={inputCls} placeholder="5000" />
              </div>
              <div className="w-24">
                <label className={labelCls} htmlFor="currency">Currency</label>
                <select id="currency" name="currency" className={inputCls} defaultValue="UGX">
                  <option value="UGX">UGX</option>
                  <option value="USD">USD</option>
                  <option value="KES">KES</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-brand-text-muted">Amount per member/case/card, or a percentage for “% of claims paid”.</p>
            <div className="flex justify-end">
              <SubmitButton>Create agreement</SubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Invoice accrued fees</h2>
          <p className="mb-3 text-sm text-brand-text-muted">
            Accrued (uninvoiced) total on screen: <strong className="text-brand-text-heading">{accruedTotal.toLocaleString()} UGX</strong>.
            Rolls every ACCRUED ledger entry for the client into one invoice reference.
          </p>
          <form action={invoiceAccruedAction} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="invClient">Client</label>
              <select id="invClient" name="clientId" required className={inputCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end">
              <SubmitButton>Invoice accrued</SubmitButton>
            </div>
          </form>
        </section>
      </div>

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Agreements</h2>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Client</th>
              <th className="px-4 py-2.5">Method</th>
              <th className="px-4 py-2.5">Rate</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {agreements.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-muted">No agreements yet.</td></tr>
            ) : agreements.map((a) => (
              <tr key={a.id} className={a.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-medium text-brand-text-heading">{a.client?.name ?? "All clients"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{METHOD_LABEL[a.method] ?? a.method}</td>
                <td className="px-4 py-2.5 font-mono">{Number(a.rate).toLocaleString()}{a.method === "PCT_OF_CLAIMS" ? " %" : ` ${a.currency}`}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.isActive ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {a.isActive ? "Active" : "Ended"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {a.isActive && (
                    <form action={endAdminFeeAgreementAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-xs font-semibold text-brand-error hover:underline">End</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <h2 className="border-b border-brand-border px-4 py-3 text-sm font-semibold uppercase text-brand-text-muted">Ledger (latest 50)</h2>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Period</th>
              <th className="px-4 py-2.5">Client</th>
              <th className="px-4 py-2.5">Method</th>
              <th className="px-4 py-2.5">Basis</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {ledger.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-brand-text-muted">No ledger entries — create an agreement and run the accrual.</td></tr>
            ) : ledger.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2.5 font-mono text-brand-text-body">{e.period || "event"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{e.client?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{e.method}</td>
                <td className="px-4 py-2.5 font-mono text-brand-text-muted">{e.basis != null ? Number(e.basis).toLocaleString() : "—"}</td>
                <td className="px-4 py-2.5 font-mono text-brand-text-heading">{Number(e.amount).toLocaleString()} {e.currency}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${e.status === "ACCRUED" ? "bg-[#FFC107]/15 text-[#856404]" : e.status === "INVOICED" ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-brand-text-muted">{e.invoiceId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
