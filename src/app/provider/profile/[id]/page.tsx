import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderMasterDataChangeService } from "@/server/services/provider-master-data-change/service";
import { PROVIDER_WITHDRAWABLE_MASTER_DATA } from "@/server/services/provider-master-data-change/policy";
import { ChangeRequestActions } from "./ChangeRequestActions";

/**
 * PNOS F7.6 — provider change-request detail: the current-vs-proposed diff (safe,
 * masked), the SHARED timeline, and the provider's own actions (respond to an
 * information request, withdraw). No INTERNAL note or maker/checker data is shown.
 */
const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-[#FFC107]/10 text-[#856404]", UNDER_REVIEW: "bg-brand-indigo/10 text-brand-indigo",
  INFORMATION_REQUIRED: "bg-[#FFC107]/10 text-[#856404]", PROVIDER_RESPONDED: "bg-brand-indigo/10 text-brand-indigo",
  PENDING_CHECKER: "bg-brand-indigo/10 text-brand-indigo", APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]", WITHDRAWN: "bg-[#E6E7E8] text-[#6C757D]",
};

export default async function ChangeRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { id } = await params;

  let data: Awaited<ReturnType<typeof ProviderMasterDataChangeService.getForProvider>>;
  try {
    data = await ProviderMasterDataChangeService.getForProvider(ctx, id);
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }
  if (!data) notFound();

  const { request: r, version } = data;
  const current = (r.currentSnapshot ?? {}) as Record<string, unknown>;
  const proposed = (r.proposedValues ?? {}) as Record<string, unknown>;
  const fields = Object.keys(proposed);
  const canRespond = r.status === "INFORMATION_REQUIRED";
  const canWithdraw = (PROVIDER_WITHDRAWABLE_MASTER_DATA as string[]).includes(r.status);
  const val = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const fmtDate = (v: Date | string | null) => (v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/profile" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to profile"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading capitalize">{r.category.replace(/_/g, " ").toLowerCase()} change</h1>
          <p className="text-sm text-brand-text-muted mt-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_TONE[r.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{r.status.replace(/_/g, " ")}</span>
            {" "}· submitted {fmtDate(r.createdAt)} · due {fmtDate(r.dueAt)}
          </p>
        </div>
      </div>

      {/* Current vs proposed diff */}
      <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Requested change</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem]">
            <thead className="text-[11px] uppercase text-brand-text-muted"><tr className="border-b border-[#EEEEEE]"><th className="text-left px-5 py-2 font-bold">Field</th><th className="text-left px-5 py-2 font-bold">Current</th><th className="text-left px-5 py-2 font-bold">Proposed</th></tr></thead>
            <tbody className="divide-y divide-[#F4F4F4]">
              {fields.map((f) => (
                <tr key={f}>
                  <th scope="row" className="px-5 py-2 font-normal text-brand-text-heading capitalize">{f.replace(/([A-Z])/g, " $1").toLowerCase()}</th>
                  <td className="px-5 py-2 text-brand-text-muted">{val(current[f])}</td>
                  <td className="px-5 py-2 font-semibold text-brand-text-heading">{val(proposed[f])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.narrative && <p className="px-5 py-2 text-xs text-brand-text-muted border-t border-[#EEEEEE]">Note: {r.narrative}</p>}
        {r.decisionExplanation && <p className="px-5 py-2 text-sm text-brand-text-body border-t border-[#EEEEEE]">Decision: {r.decisionExplanation}</p>}
      </section>

      {/* Timeline (SHARED only) */}
      <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Timeline</h2>
        <ul className="divide-y divide-[#F4F4F4]">
          {r.timeline.map((t, i) => (
            <li key={i} className="px-5 py-2.5 text-sm flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-brand-text-heading">{t.eventType.replace(/_/g, " ").toLowerCase()}</span>
              <span className="text-xs text-brand-text-muted">{fmtDate(t.at)}</span>
              {t.body && <span className="text-brand-text-body w-full text-xs">{t.body}</span>}
            </li>
          ))}
        </ul>
      </section>

      {(canRespond || canWithdraw) && <ChangeRequestActions id={r.id} version={version} canRespond={canRespond} canWithdraw={canWithdraw} />}
    </div>
  );
}
