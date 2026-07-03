import { requireRole, ROLES } from "@/lib/rbac";
import { ClaimsService } from "@/server/services/claims.service";
import { slaState, type ContractSlaTerms } from "@/lib/claims-sla";
import { LayoutGrid, Clock, Building2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { QueueAlerts } from "./QueueAlerts";

// Ordered active-work lanes. "Ready to pay" folds the approved states.
const LANES: { key: string; label: string; statuses: string[] }[] = [
  { key: "INCURRED", label: "Incurred", statuses: ["INCURRED"] },
  { key: "RECEIVED", label: "Received", statuses: ["RECEIVED"] },
  { key: "CAPTURED", label: "Captured", statuses: ["CAPTURED"] },
  { key: "UNDER_REVIEW", label: "Under review", statuses: ["UNDER_REVIEW"] },
  { key: "READY_TO_PAY", label: "Approved — awaiting pay", statuses: ["APPROVED", "PARTIALLY_APPROVED"] },
];

// Payment-SLA bands within a facility (decision D2): outpatient-class claims
// pay in 24 h; inpatient runs the weekly cycle. Contract terms refine per claim.
const SLA_BANDS: { key: string; label: string; serviceTypes: string[] }[] = [
  { key: "OP", label: "Outpatient — pay in 24 h", serviceTypes: ["OUTPATIENT", "DAY_CASE", "EMERGENCY"] },
  { key: "IP", label: "Inpatient — weekly cycle", serviceTypes: ["INPATIENT"] },
];

const LANE_CAP = 50; // self-contained scrolling; full list lives at /claims

type QueueClaim = Awaited<ReturnType<typeof ClaimsService.getActiveQueues>>[number];

function claimSla(c: QueueClaim) {
  return slaState({
    receivedAt: c.receivedAt,
    serviceType: c.serviceType,
    contractTerms: (c.contract as ContractSlaTerms | null) ?? null,
  });
}

function ClaimCard({ c }: { c: QueueClaim }) {
  const sla = claimSla(c);
  const badge = sla.critical
    ? "bg-brand-error text-white"
    : sla.breached
      ? "bg-brand-error/10 text-brand-error"
      : "bg-brand-bg-alt text-brand-text-muted";
  return (
    <Link
      href={`/claims/${c.id}`}
      className="block rounded-md border border-brand-border bg-brand-bg p-2.5 text-sm hover:border-brand-teal"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-brand-text-muted">{c.claimNumber}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>
          <Clock className="h-2.5 w-2.5" />
          {sla.breached ? `${-sla.dueInHours}h over` : `${sla.dueInHours}h left`}
        </span>
      </div>
      <div className="mt-1 font-medium text-brand-text-heading">
        {c.member.firstName} {c.member.lastName}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-brand-text-body">{c.currency} {Number(c.billedAmount).toLocaleString()}</span>
        <span className="text-[10px] uppercase text-brand-text-muted">{c.source}</span>
      </div>
    </Link>
  );
}

export default async function ClaimQueuesPage() {
  const session = await requireRole(ROLES.OPS);
  const [claims, facilities] = await Promise.all([
    ClaimsService.getActiveQueues(session.user.tenantId, session.user.clientId, { take: 500 }),
    ClaimsService.getQueueFacilitySummary(session.user.tenantId, session.user.clientId),
  ]);

  const byProvider = new Map<string, QueueClaim[]>();
  for (const c of claims) {
    const list = byProvider.get(c.providerId) ?? [];
    list.push(c);
    byProvider.set(c.providerId, list);
  }

  // Facility-first ordering (issue 2): most breached work floats to the top.
  const facilitySections = facilities
    .map((f) => {
      const items = byProvider.get(f.providerId) ?? [];
      const breached = items.filter((c) => claimSla(c).breached).length;
      return { ...f, items, breached };
    })
    .sort((a, b) => b.breached - a.breached || b.total - a.total);

  const breachedTotal = facilitySections.reduce((n, f) => n + f.breached, 0);
  const receivedTotal = claims.filter((c) => c.status === "RECEIVED").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-brand-secondary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Claims Queues</h1>
            <p className="text-sm text-brand-text-muted">
              Grouped by facility, urgent payment SLAs first. {claims.length} active
              {breachedTotal > 0 && <span className="text-brand-error"> · {breachedTotal} over SLA</span>}.
            </p>
          </div>
        </div>
        <Link href="/claims" className="text-sm font-semibold text-brand-secondary hover:underline">All claims →</Link>
      </div>

      <QueueAlerts initialCount={receivedTotal} />

      {facilitySections.length === 0 && (
        <p className="rounded-lg border border-brand-border bg-brand-bg-alt/40 p-8 text-center text-sm text-brand-text-muted">
          No active claims. New work appears here as it lands.
        </p>
      )}

      <div className="space-y-4">
        {facilitySections.map((facility, idx) => (
          <details
            key={facility.providerId}
            open={idx === 0}
            className="group rounded-lg border border-brand-border bg-brand-bg-alt/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 font-heading font-semibold text-brand-text-heading">
                <Building2 className="h-4 w-4 text-brand-secondary" />
                {facility.providerName}
              </span>
              <span className="flex items-center gap-2 text-xs">
                {facility.breached > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-error/10 px-2 py-0.5 font-semibold text-brand-error">
                    <AlertTriangle className="h-3 w-3" />{facility.breached} over SLA
                  </span>
                )}
                <span className="rounded-full bg-brand-bg px-2 py-0.5 font-bold text-brand-text-body">
                  {facility.total} active
                </span>
              </span>
            </summary>

            <div className="space-y-4 border-t border-brand-border p-3">
              {SLA_BANDS.map((band) => {
                const bandItems = facility.items
                  .filter((c) => band.serviceTypes.includes(c.serviceType))
                  .sort((a, b) => claimSla(a).dueInHours - claimSla(b).dueInHours);
                if (bandItems.length === 0) return null;
                return (
                  <div key={band.key}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-text-muted">
                      {band.label} · {bandItems.length}
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                      {LANES.map((lane) => {
                        const items = bandItems.filter((c) => lane.statuses.includes(c.status));
                        return (
                          <div key={lane.key} className="flex max-h-[50vh] flex-col rounded-lg border border-brand-border bg-brand-bg-alt/60">
                            <div className="sticky top-0 flex items-center justify-between border-b border-brand-border bg-brand-bg-alt px-3 py-2">
                              <span className="text-xs font-semibold uppercase text-brand-text-heading">{lane.label}</span>
                              <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs font-bold text-brand-text-body">{items.length}</span>
                            </div>
                            {/* Self-contained scrolling (issue 1): the lane, not the page, grows. */}
                            <div className="min-h-16 space-y-2 overflow-y-auto overscroll-contain p-2">
                              {items.length === 0 ? (
                                <p className="px-1 py-4 text-center text-xs text-brand-text-muted">Empty</p>
                              ) : (
                                items.slice(0, LANE_CAP).map((c) => <ClaimCard key={c.id} c={c} />)
                              )}
                              {items.length > LANE_CAP && (
                                <Link
                                  href={`/claims?providerId=${facility.providerId}`}
                                  className="block rounded-md border border-dashed border-brand-border p-2 text-center text-xs font-semibold text-brand-secondary hover:underline"
                                >
                                  View all {items.length} →
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
