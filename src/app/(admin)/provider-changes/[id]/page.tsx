import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ProviderMasterDataChangeService } from "@/server/services/provider-master-data-change/service";
import { ReviewActions } from "./ReviewActions";

/**
 * PNOS F7.6 — TPA operator detail for a provider master-data change request. Shows
 * the current-vs-proposed diff, the full timeline (incl. INTERNAL events), and — for
 * a bank change — the maker/checker + independent-verification facts. All controls
 * delegate to the F7.4/F7.5 service (maker≠checker, independent verify, payment-window
 * freeze). No full account number is present (masked at submit).
 */
export default async function ProviderChangeDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const reviewer = { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string };
  const { id } = await params;
  const row = await ProviderMasterDataChangeService.getForReviewer(reviewer, id);
  if (!row) notFound();
  const provider = await prisma.provider.findFirst({ where: { id: row.providerId, tenantId: reviewer.tenantId }, select: { name: true } });

  const current = (row.currentSnapshot ?? {}) as Record<string, unknown>;
  const proposed = (row.proposedValues ?? {}) as Record<string, unknown>;
  const fields = Object.keys(proposed);
  const isBank = row.category === "BANK";
  const val = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const fmt = (v: Date | string | null) => (v ? new Date(v).toLocaleString("en-UG") : "—");

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/provider-changes" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to queue"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{provider?.name ?? "Provider"} — <span className="capitalize">{row.category.replace(/_/g, " ").toLowerCase()}</span> change</h1>
          <p className="text-sm text-brand-text-muted mt-0.5">{row.status.replace(/_/g, " ")} · risk {row.riskLevel} · v{row.version}</p>
        </div>
      </div>

      <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Requested change</h2>
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem]">
            <thead className="text-[11px] uppercase text-brand-text-muted"><tr className="border-b border-[#EEEEEE]"><th className="text-left px-5 py-2 font-bold">Field</th><th className="text-left px-5 py-2 font-bold">Current</th><th className="text-left px-5 py-2 font-bold">Proposed</th></tr></thead>
            <tbody className="divide-y divide-[#F4F4F4]">
              {fields.map((f) => (
                <tr key={f}><th scope="row" className="px-5 py-2 font-normal text-brand-text-heading capitalize">{f.replace(/([A-Z])/g, " $1").toLowerCase()}</th><td className="px-5 py-2 text-brand-text-muted">{val(current[f])}</td><td className="px-5 py-2 font-semibold">{val(proposed[f])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {row.providerNarrative && <p className="px-5 py-2 text-xs text-brand-text-muted border-t border-[#EEEEEE]">Provider note: {row.providerNarrative}</p>}
        {row.evidenceDocumentIds.length > 0 && <p className="px-5 py-2 text-xs text-brand-text-muted border-t border-[#EEEEEE]">Evidence: {row.evidenceDocumentIds.join(", ")}</p>}
      </section>

      {isBank && (
        <section className="bg-white border border-[#EEEEEE] rounded-lg p-5 text-sm space-y-1">
          <h2 className="text-[11px] font-bold uppercase text-brand-text-muted flex items-center gap-1 mb-1"><ShieldCheck size={13} /> Bank control</h2>
          <p>Maker: <span className="font-mono">{row.makerId ?? "—"}</span>{row.makerAt ? ` · ${fmt(row.makerAt)}` : ""}</p>
          <p>Checker: <span className="font-mono">{row.checkerId ?? "—"}</span>{row.checkerAt ? ` · ${fmt(row.checkerAt)}` : ""}</p>
          <p>Verified: {row.verifiedAt ? `${row.verificationMethod} · ${fmt(row.verifiedAt)}` : "not yet — independent verification required"}</p>
          <p>Activated: {row.activatedAt ? fmt(row.activatedAt) : "not activated"}</p>
        </section>
      )}

      <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Timeline</h2>
        <ul className="divide-y divide-[#F4F4F4]">
          {row.events.map((e) => (
            <li key={e.id} className="px-5 py-2 text-sm flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold capitalize">{e.eventType.replace(/_/g, " ").toLowerCase()}</span>
              {e.audience === "INTERNAL" && <span className="text-[10px] font-bold px-1.5 rounded bg-[#E6E7E8] text-[#6C757D]">internal</span>}
              <span className="text-xs text-brand-text-muted">{fmt(e.createdAt)}</span>
              {e.body && <span className="w-full text-xs text-brand-text-body">{e.body}</span>}
            </li>
          ))}
        </ul>
      </section>

      <ReviewActions
        id={row.id}
        version={row.version}
        status={row.status}
        isBank={isBank}
        verified={!!row.verifiedAt}
        activated={!!row.activatedAt}
      />
    </div>
  );
}
