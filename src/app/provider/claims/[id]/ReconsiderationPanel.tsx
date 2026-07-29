import type { ProviderReconsiderationView } from "@/server/services/claim-reconsideration/policy";

/**
 * F5.13 — the provider-facing reconsideration status (step 6: show shared SLA/outcome only).
 * Fed EXCLUSIVELY by the F5.11 provider projection, so no internal field (the original
 * adjudicator, internal notes, the assigned reviewer/team) can ever reach the provider. Pure.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  TRIAGE: "In triage",
  INFORMATION_REQUIRED: "Information required",
  PROVIDER_RESPONDED: "Response submitted",
  UNDER_REVIEW: "Under review",
  ACCEPTED: "Accepted",
  PARTIALLY_ACCEPTED: "Partially accepted",
  UPHELD: "Upheld — original stands",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};

const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-UG") : null);

export function ReconsiderationPanel({ view, currency }: { view: ProviderReconsiderationView; currency: string }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Requested", value: `${currency} ${Number(view.requestedAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];
  const filed = fmtDate(view.filedAt);
  const deadline = fmtDate(view.filingDeadline);
  const due = fmtDate(view.dueAt);
  if (filed) rows.push({ label: "Filed", value: filed });
  if (deadline) rows.push({ label: "Filing deadline", value: deadline });
  if (due) rows.push({ label: "Review due", value: due });

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden" data-testid="reconsideration-panel">
      <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center justify-between gap-3">
        <h2 className="font-bold text-brand-text-heading font-heading">Reconsideration</h2>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-indigo/10 text-brand-indigo">{STATUS_LABEL[view.status] ?? view.status.replace(/_/g, " ")}</span>
      </div>
      <dl className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[11px] font-bold uppercase text-brand-text-muted">{r.label}</dt>
            <dd className="text-sm font-semibold text-brand-text-heading mt-0.5">{r.value}</dd>
          </div>
        ))}
      </dl>
      {view.outcomeSafeExplanation && (
        <div className="px-5 pb-4">
          <dt className="text-[11px] font-bold uppercase text-brand-text-muted">Outcome</dt>
          <dd className="text-sm text-brand-text-body mt-0.5">{view.outcomeSafeExplanation}</dd>
        </div>
      )}
      {view.providerNarrative && (
        <div className="px-5 pb-4 border-t border-[#F4F4F4] pt-3">
          <dt className="text-[11px] font-bold uppercase text-brand-text-muted">Your submission</dt>
          <dd className="text-xs text-brand-text-muted mt-0.5">{view.providerNarrative}</dd>
        </div>
      )}
    </div>
  );
}
