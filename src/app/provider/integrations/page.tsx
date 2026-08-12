import { redirect } from "next/navigation";
import { Cable } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderIntegrationOpsRead } from "@/server/services/provider-integration/ops-read.service";

/**
 * PNOS F9.8 — provider integration operations view.
 *
 * The provider sees the health of its OWN integration connections (status, circuit,
 * last success/failure, delivery counts by status, retry-due) and its most recent
 * deliveries with a safe status/counts/next-action projection — NO raw payload,
 * secret, header, or PHI. Read-only; lifecycle actions are permission-gated server
 * actions. Server-authorized on provider.integrations.manage.
 */
export default async function ProviderIntegrations() {
  const { ctx } = await ProviderAccessService.resolveUserContext();

  let health: Awaited<ReturnType<typeof ProviderIntegrationOpsRead.listConnectionHealth>>;
  let deliveries: Awaited<ReturnType<typeof ProviderIntegrationOpsRead.listDeliveries>>;
  try {
    [health, deliveries] = await Promise.all([
      ProviderIntegrationOpsRead.listConnectionHealth(ctx),
      ProviderIntegrationOpsRead.listDeliveries(ctx, { take: 25 }),
    ]);
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }

  const badge = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-[#28A745]/10 text-[#28A745]";
      case "QUARANTINED": case "REJECTED": return "bg-[#DC3545]/10 text-[#DC3545]";
      case "RETRYING": case "PARTIAL": return "bg-[#F0A500]/10 text-[#B8860B]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Cable size={20} className="text-brand-indigo" />
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Integrations</h1>
      </div>
      <p className="text-brand-text-body font-body text-sm">
        Health and delivery history for your HMS integration connections. Errors are shown as safe codes — no clinical payload, secret, or header is ever displayed here.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-text-muted">Connections</h2>
        {health.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No integration connections yet.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {health.map((c) => (
              <div key={c.id} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-brand-text-heading">{c.label}</h3>
                    <p className="text-xs text-brand-text-muted">{c.connectorType} · {c.mode}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${badge(c.status)}`}>{c.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div><div className="font-bold text-brand-text-heading">{c.deliveries.total}</div><div className="text-brand-text-muted">total</div></div>
                  <div><div className="font-bold text-[#F0A500]">{c.deliveries.retryDue}</div><div className="text-brand-text-muted">retry-due</div></div>
                  <div><div className="font-bold text-[#DC3545]">{c.deliveries.quarantined}</div><div className="text-brand-text-muted">quarantined</div></div>
                  <div><div className="font-bold text-[#28A745]">{c.deliveries.completed}</div><div className="text-brand-text-muted">done</div></div>
                </div>
                <p className="mt-2 text-[11px] text-brand-text-muted">Circuit: {c.circuitState}{c.lastFailureAt ? ` · last failure ${new Date(c.lastFailureAt).toLocaleString("en-UG")}` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-text-muted">Recent deliveries</h2>
        {deliveries.items.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No deliveries yet.</p>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-text-muted border-b border-[#EEEEEE]">
                  <th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Records</th>
                  <th className="py-2 pr-3">Applied</th><th className="py-2 pr-3">Received</th><th className="py-2 pr-3">Next action</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.items.map((d) => (
                  <tr key={d.id} className="border-b border-[#F5F5F5]">
                    <td className="py-2 pr-3">{d.businessObjectType}</td>
                    <td className="py-2 pr-3"><span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${badge(d.status)}`}>{d.status}</span></td>
                    <td className="py-2 pr-3">{d.recordCount ?? "—"}</td>
                    <td className="py-2 pr-3">{d.appliedCount}</td>
                    <td className="py-2 pr-3 text-xs text-brand-text-muted">{new Date(d.receivedAt).toLocaleString("en-UG")}</td>
                    <td className="py-2 pr-3 text-xs">{d.nextAction}</td>
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
