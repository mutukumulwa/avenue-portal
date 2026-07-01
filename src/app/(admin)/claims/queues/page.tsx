import { requireRole, ROLES } from "@/lib/rbac";
import { ClaimsService } from "@/server/services/claims.service";
import { LayoutGrid, Clock } from "lucide-react";
import Link from "next/link";

// Ordered active-work lanes. "Ready to pay" folds the approved states.
const LANES: { key: string; label: string; statuses: string[]; slaHours: number }[] = [
  { key: "INCURRED", label: "Incurred", statuses: ["INCURRED"], slaHours: 72 },
  { key: "RECEIVED", label: "Received", statuses: ["RECEIVED"], slaHours: 24 },
  { key: "CAPTURED", label: "Captured — awaiting review", statuses: ["CAPTURED"], slaHours: 48 },
  { key: "UNDER_REVIEW", label: "Under review", statuses: ["UNDER_REVIEW"], slaHours: 48 },
  { key: "READY_TO_PAY", label: "Approved — awaiting pay", statuses: ["APPROVED", "PARTIALLY_APPROVED"], slaHours: 72 },
];

function ageHours(from: Date): number {
  return Math.floor((Date.now() - new Date(from).getTime()) / 3_600_000);
}

export default async function ClaimQueuesPage() {
  const session = await requireRole(ROLES.OPS);
  const claims = await ClaimsService.getActiveQueues(session.user.tenantId, session.user.clientId);

  const byLane = LANES.map((lane) => ({
    ...lane,
    items: claims.filter((c) => lane.statuses.includes(c.status)),
  }));
  const breachedTotal = byLane.reduce(
    (n, lane) => n + lane.items.filter((c) => ageHours(c.receivedAt) > lane.slaHours).length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-brand-secondary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Claims Queues</h1>
            <p className="text-sm text-brand-text-muted">
              Live work queues by lifecycle state with SLA timers. {claims.length} active
              {breachedTotal > 0 && <span className="text-brand-error"> · {breachedTotal} over SLA</span>}.
            </p>
          </div>
        </div>
        <Link href="/claims" className="text-sm font-semibold text-brand-secondary hover:underline">All claims →</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {byLane.map((lane) => (
          <div key={lane.key} className="rounded-lg border border-brand-border bg-brand-bg-alt/40">
            <div className="flex items-center justify-between border-b border-brand-border px-3 py-2">
              <span className="text-xs font-semibold uppercase text-brand-text-heading">{lane.label}</span>
              <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs font-bold text-brand-text-body">{lane.items.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {lane.items.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-brand-text-muted">Empty</p>
              ) : lane.items.map((c) => {
                const age = ageHours(c.receivedAt);
                const breached = age > lane.slaHours;
                return (
                  <Link
                    key={c.id}
                    href={`/claims/${c.id}`}
                    className="block rounded-md border border-brand-border bg-brand-bg p-2.5 text-sm hover:border-brand-teal"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-brand-text-muted">{c.claimNumber}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${breached ? "bg-brand-error/10 text-brand-error" : "bg-brand-bg-alt text-brand-text-muted"}`}>
                        <Clock className="h-2.5 w-2.5" />{age}h
                      </span>
                    </div>
                    <div className="mt-1 font-medium text-brand-text-heading">
                      {c.member.firstName} {c.member.lastName}
                    </div>
                    <div className="text-xs text-brand-text-muted">{c.provider.name}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-brand-text-body">{c.currency} {Number(c.billedAmount).toLocaleString()}</span>
                      <span className="text-[10px] uppercase text-brand-text-muted">{c.source}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
