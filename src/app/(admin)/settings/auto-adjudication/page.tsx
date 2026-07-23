import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  createPolicyDraftAction,
  submitPolicyForApprovalAction,
  deactivatePolicyAction,
  openBreakerAction,
  closeBreakerAction,
} from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Zap, ShieldAlert, Activity } from "lucide-react";
import Link from "next/link";
import { getBreakerState } from "@/server/services/claim-autopilot/circuit-breaker";
import { shadowAgreementMetrics } from "@/server/services/claim-autopilot/shadow";
import { findStuckRuns } from "@/server/services/claim-intake/reconciliation";
import { effectivePolicyMode, type PolicyLike } from "@/server/services/claim-autopilot/policy";

/**
 * F6.5 — Claims Autopilot operations console (§12.4–§12.5, §13).
 * a) Safety/performance dashboard: circuit breaker (prominent), processing
 *    backlog, stale/failed runs, worker freshness, shadow agreement.
 * b) Governed policy console: versioned DRAFT → PENDING_APPROVAL → APPROVED
 *    (maker–checker via the approval matrix) → immediate deactivation.
 * No PHI: counts, states and policy metadata only.
 */
/** Data loader kept OUTSIDE the component: clocks/queries are impure for the
 *  react-hooks purity rule, and none of this belongs in render anyway. */
async function loadConsoleData(tenantId: string) {
  const now = Date.now();
  const [clients, policies, breaker, backlog, retryable, failed24h, stuck, workerBeat, shadow, stateCounts] = await Promise.all([
    prisma.client.findMany({ where: { operatorTenantId: tenantId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.autoAdjudicationPolicy.findMany({
      where: { tenantId },
      orderBy: [{ clientId: "asc" }, { version: "desc" }],
      include: { client: { select: { name: true } } },
      take: 50,
    }),
    getBreakerState(tenantId),
    prisma.claimProcessingRun.count({ where: { tenantId, state: "PENDING" } }),
    prisma.claimProcessingRun.count({ where: { tenantId, state: "RETRYABLE" } }),
    prisma.claimProcessingRun.count({ where: { tenantId, state: "FAILED", completedAt: { gte: new Date(now - 24 * 3_600_000) } } }),
    findStuckRuns(prisma, 15, tenantId),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true, host: true } }),
    shadowAgreementMetrics(prisma, tenantId),
    prisma.claim.groupBy({
      by: ["processingState"],
      where: { tenantId, processingState: { not: null }, createdAt: { gte: new Date(now - 7 * 86_400_000) } },
      _count: { _all: true },
    }),
  ]);
  const workerFresh = workerBeat != null && now - workerBeat.lastSeenAt.getTime() < 5 * 60_000;
  return { clients, policies, breaker, backlog, retryable, failed24h, stuck, shadow, stateCounts, workerFresh };
}

export default async function AutoAdjudicationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const { clients, policies, breaker, backlog, retryable, failed24h, stuck, shadow, stateCounts, workerFresh } = await loadConsoleData(tenantId);
  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";
  const statusBadge = (status: string) =>
    ({
      APPROVED: "bg-brand-success/10 text-brand-success",
      PENDING_APPROVAL: "bg-[#FFC107]/15 text-[#856404]",
      DRAFT: "bg-brand-text-muted/10 text-brand-text-muted",
      REJECTED: "bg-brand-error/10 text-brand-error",
      SUPERSEDED: "bg-brand-text-muted/10 text-brand-text-muted",
      DEACTIVATED: "bg-brand-error/10 text-brand-error",
    })[status] ?? "bg-brand-text-muted/10 text-brand-text-muted";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Claims Autopilot — operations</h1>
          <p className="text-sm text-brand-text-muted">
            Automation moves money only under an APPROVED, LIVE, checker-signed policy version, inside its
            ceiling, with the circuit breaker closed. Everything else routes to a human with a named reason.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">{error}</div>
      )}

      {/* ── Circuit breaker (prominent, D18) ─────────────────────────────── */}
      <section className={`rounded-lg border p-5 ${breaker?.isOpen ? "border-brand-error bg-brand-error/5" : "border-brand-border bg-brand-bg"}`}>
        <div className="flex items-start gap-3">
          <ShieldAlert className={`h-5 w-5 ${breaker?.isOpen ? "text-brand-error" : "text-brand-text-muted"}`} />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-brand-text-heading">
              Circuit breaker: {breaker?.isOpen ? "OPEN — live automation is stopped" : "closed (live execution permitted where a LIVE policy exists)"}
            </h2>
            {breaker?.isOpen && (
              <p className="mt-1 text-xs text-brand-text-muted">
                Opened {breaker.openedAt ? new Date(breaker.openedAt).toLocaleString("en-UG") : ""}
                {breaker.autoTriggered ? " (auto-tripped)" : ""} — {breaker.reason ?? "no reason recorded"}. Intake, evaluation and
                shadow continue; only automatic money is blocked.
              </p>
            )}
            <form action={breaker?.isOpen ? closeBreakerAction : openBreakerAction} className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-56">
                <label className={labelCls} htmlFor="breaker-reason">Reason (required, audited)</label>
                <input id="breaker-reason" name="reason" className={inputCls} placeholder={breaker?.isOpen ? "Incident resolved…" : "Why stop live automation…"} />
              </div>
              <SubmitButton>{breaker?.isOpen ? "Close breaker (resume live)" : "OPEN breaker (stop live now)"}</SubmitButton>
            </form>
          </div>
        </div>
      </section>

      {/* ── Pipeline health ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-brand-text-muted"><Activity size={14} /> Pipeline health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Pending runs", value: backlog, warn: backlog > 25 },
            { label: "Retryable runs", value: retryable, warn: retryable > 10 },
            { label: "Stale >15 min", value: stuck.length, warn: stuck.length > 0 },
            { label: "Failed (24 h)", value: failed24h, warn: failed24h > 0 },
            { label: "Worker", value: workerFresh ? "fresh" : "STALE", warn: !workerFresh },
            { label: "Shadow agreement", value: shadow.compared === 0 ? "n/a" : `${Math.round(shadow.agreementRate * 100)}% of ${shadow.compared}`, warn: shadow.compared > 0 && shadow.agreementRate < 0.9 },
          ].map((c) => (
            <div key={c.label} className={`rounded-md border px-3 py-2.5 ${c.warn ? "border-[#FFC107] bg-[#FFC107]/10" : "border-brand-border"}`}>
              <div className="text-lg font-bold text-brand-text-heading">{String(c.value)}</div>
              <div className="text-[11px] text-brand-text-muted">{c.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-brand-text-muted">
          Processing states (7 days): {stateCounts.length === 0 ? "none" : stateCounts.map((s) => `${s.processingState}: ${s._count._all}`).join(" · ")}
          {" — "}stale/failed runs recover through the sweep; exceptions are worked from the{" "}
          <Link href="/claims/queues" className="font-semibold text-brand-teal hover:underline">claims queues</Link>.
        </p>
      </section>

      {/* ── Governed policy versions ─────────────────────────────────────── */}
      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">New policy version (draft — inert until a checker approves)</h2>
        <form action={createPolicyDraftAction} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="name">Version name</label>
            <input id="name" name="name" className={inputCls} placeholder="Outpatient live pilot v2" required />
          </div>
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
            <label className={labelCls} htmlFor="mode">Mode</label>
            <select id="mode" name="mode" className={inputCls} defaultValue="SHADOW">
              <option value="OFF">OFF — route everything</option>
              <option value="SHADOW">SHADOW — propose, never move money</option>
              <option value="LIVE">LIVE — execute within the ceiling</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="maxAutoApproveAmount">Auto-approve ceiling (required for LIVE)</label>
            <div className="flex gap-2">
              <input id="maxAutoApproveAmount" name="maxAutoApproveAmount" type="number" min="0" step="0.01" className={inputCls} placeholder="500000" />
              <select name="currency" className={`${inputCls} w-24`} defaultValue="UGX">
                <option value="UGX">UGX</option>
                <option value="USD">USD</option>
                <option value="KES">KES</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 self-end text-sm text-brand-text-body">
            <input type="checkbox" name="allowAutoPartial" className="h-4 w-4" />
            Allow automatic PARTIAL approvals
          </label>
          <div className="flex items-end justify-end">
            <SubmitButton>Create draft</SubmitButton>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Scope</th>
              <th className="px-4 py-2.5">Version</th>
              <th className="px-4 py-2.5">Mode</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Effective mode</th>
              <th className="px-4 py-2.5">Ceiling</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {policies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-brand-text-muted">
                  No policy versions. Without an APPROVED LIVE policy every claim routes to a human (fail-safe).
                </td>
              </tr>
            ) : (
              policies.map((p) => {
                const effective = effectivePolicyMode(p as unknown as PolicyLike);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-medium text-brand-text-heading">{p.client?.name ?? "Operator default"}</td>
                    <td className="px-4 py-2.5">v{p.version} — {p.name ?? "unnamed"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.mode}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge(p.status)}`}>{p.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{effective}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.maxAutoApproveAmount != null ? `${Number(p.maxAutoApproveAmount).toLocaleString()} ${p.currency}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {(p.status === "DRAFT" || p.status === "REJECTED") && (
                        <form action={submitPolicyForApprovalAction} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs font-semibold text-brand-teal hover:underline">Submit for approval</button>
                        </form>
                      )}
                      {p.status === "PENDING_APPROVAL" && (
                        <Link href="/settings/approval-matrix" className="text-xs font-semibold text-brand-text-muted hover:underline">
                          Awaiting checker
                        </Link>
                      )}
                      {p.status === "APPROVED" && (
                        <form action={deactivatePolicyAction} className="inline-flex items-center gap-1.5">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="reason" placeholder="Reason…" className="w-32 rounded border border-brand-border bg-brand-bg px-2 py-1 text-xs" required />
                          <button className="text-xs font-semibold text-brand-error hover:underline">Deactivate</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-brand-text-muted">
        Maker–checker: the submitter of a version can never approve it; approval flows through the{" "}
        <Link href="/settings/approval-matrix" className="font-semibold text-brand-teal hover:underline">approval matrix</Link>. Case-derived
        (inpatient) claims stay SHADOW even under a LIVE policy until the inpatient release gate.
      </p>
    </div>
  );
}
