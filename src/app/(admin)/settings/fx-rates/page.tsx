import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { BASE_CURRENCY } from "@/server/services/fx.service";
import { createFxRateAction, deactivateFxRateAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Coins } from "lucide-react";

export default async function FxRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;

  const [currencies, rates] = await Promise.all([
    prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.fxRate.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: [{ quoteCurrency: "asc" }, { effectiveFrom: "desc" }],
    }),
  ]);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Coins className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">FX Rates</h1>
          <p className="text-sm text-brand-text-muted">
            Base currency is <strong>{BASE_CURRENCY}</strong>. Rates normalise
            subsidiary-currency amounts (approval bands, consolidation). Rate =
            how many {BASE_CURRENCY} one unit of the quote currency is worth.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Set a rate</h2>
        <form action={createFxRateAction} className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls} htmlFor="quoteCurrency">Quote currency</label>
            <select id="quoteCurrency" name="quoteCurrency" className={inputCls} defaultValue="">
              <option value="" disabled>Select…</option>
              {currencies.filter((c) => c.code !== BASE_CURRENCY).map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="rate">1 unit = ? {BASE_CURRENCY}</label>
            <input id="rate" name="rate" type="number" step="0.0001" min="0" required className={inputCls} placeholder="3800" />
          </div>
          <div>
            <label className={labelCls} htmlFor="source">Source</label>
            <input id="source" name="source" className={inputCls} placeholder="manual" />
          </div>
          <div className="col-span-3 flex justify-end">
            <SubmitButton>Set rate</SubmitButton>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5">Rate</th>
              <th className="px-4 py-2.5">Effective</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {rates.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-text-muted">No rates yet.</td></tr>
            ) : rates.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-2.5 font-medium text-brand-text-heading">{r.quoteCurrency} → {r.baseCurrency}</td>
                <td className="px-4 py-2.5 font-mono text-brand-text-body">1 {r.quoteCurrency} = {Number(r.rate).toLocaleString()} {r.baseCurrency}</td>
                <td className="px-4 py-2.5 text-brand-text-body">{new Date(r.effectiveFrom).toLocaleDateString("en-UG")}</td>
                <td className="px-4 py-2.5 text-brand-text-muted">{r.source ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.isActive ? "bg-brand-success/10 text-brand-success" : "bg-brand-text-muted/10 text-brand-text-muted"}`}>
                    {r.isActive ? "Active" : "Superseded"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.isActive && (
                    <form action={deactivateFxRateAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs font-semibold text-brand-error hover:underline">Deactivate</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
