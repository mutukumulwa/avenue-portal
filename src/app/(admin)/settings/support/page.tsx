import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Search, Activity } from "lucide-react";
import {
  lookupForSupport,
  maySupportLookup,
  observabilityMetrics,
} from "@/server/services/support-lookup.service";
import { flagSnapshot } from "@/lib/feature-flags";

/**
 * UAT-HF P12.01 — the support surface.
 *
 * Acceptance: operation/correlation lookup "**without database console
 * access**". Everything here answers a support question that today requires
 * production database credentials: did this write commit, is the outbox behind,
 * which release flags are actually on.
 *
 * A GET form is used deliberately, and it is safe here: the reference is an
 * opaque operation id, never a member number. DEF-057 and DEF-079 were about
 * business identifiers travelling in URLs — this is the case those defects
 * carved out, not an exception to them.
 */
export default async function SupportLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const { ref } = await searchParams;

  const permitted = maySupportLookup(session.user.permissions);

  if (!permitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Support lookup</h1>
        <div role="status" className="rounded-[8px] border border-[#EEEEEE] bg-[#F8F9FA] p-5">
          <p className="text-sm font-semibold text-brand-text-heading">
            You do not have the support lookup permission.
          </p>
          <p className="text-sm text-brand-text-muted mt-1">
            This surface shows other users&apos; operations, so it needs
            <code className="mx-1 text-xs bg-white border border-[#EEEEEE] px-1 rounded">support.operation.lookup</code>
            rather than a general staff login. Ask an administrator to grant it.
          </p>
        </div>
      </div>
    );
  }

  const [result, metrics] = await Promise.all([
    ref ? lookupForSupport({ tenantId: session.user.tenantId, reference: ref }) : Promise.resolve(null),
    observabilityMetrics(session.user.tenantId),
  ]);

  const flags = flagSnapshot();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" aria-label="Back to settings" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Support lookup</h1>
          <p className="text-brand-text-muted text-sm mt-0.5">
            Answer &ldquo;did my save go through?&rdquo; without a database console.
          </p>
        </div>
      </div>

      {/* ── Lookup ─────────────────────────────────────────────────────── */}
      <form method="GET" className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <label htmlFor="ref" className="block text-xs font-bold text-brand-text-muted uppercase">
          Operation or correlation reference
        </label>
        <div className="flex gap-2">
          <input
            id="ref"
            name="ref"
            type="text"
            defaultValue={ref ?? ""}
            placeholder="The reference shown on the operator's screen"
            className="flex-1 border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
          />
          <button type="submit" className="bg-brand-indigo text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-brand-secondary transition-colors inline-flex items-center gap-1.5">
            <Search size={14} /> Look up
          </button>
        </div>
        <p className="text-[11px] text-brand-text-muted">
          Opaque references only. A member number will not match — identifiers are
          deliberately not searchable here.
        </p>
      </form>

      {result && (
        <div className={`rounded-[8px] border p-5 shadow-sm ${
          result.found ? "bg-white border-[#EEEEEE]" : "bg-[#F8F9FA] border-[#EEEEEE]"
        }`}>
          <p className={`text-sm font-semibold ${
            result.state === "UNKNOWN" ? "text-[#856404]" : "text-brand-text-heading"
          }`}>
            {result.verdict}
          </p>

          {result.found && (
            <>
              <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                {[
                  ["Operation", result.operationId],
                  ["Type", result.operationType],
                  ["State", result.state],
                  ["Entity", result.entityType ? `${result.entityType} ${result.entityRef ?? result.entityId ?? ""}`.trim() : "—"],
                  ["Raised", result.createdAt?.toLocaleString("en-UG") ?? "—"],
                  ["Completed", result.completedAt?.toLocaleString("en-UG") ?? "—"],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3 border-b border-[#EEEEEE]/60 pb-1">
                    <span className="text-brand-text-muted">{k}</span>
                    <span className="font-mono text-brand-text-heading text-right break-all">{v || "—"}</span>
                  </div>
                ))}
              </div>

              {result.timeline.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-bold text-brand-text-muted uppercase mb-1">What happened</p>
                  {result.timeline.map((t, i) => (
                    <p key={i} className="text-xs text-brand-text-body">
                      <span className="font-mono text-brand-text-muted">{t.at.toLocaleTimeString("en-UG")}</span>
                      {"  "}
                      <span className="font-semibold">{t.kind}</span> {t.label}
                      {t.detail && <span className="text-brand-text-muted"> — {t.detail}</span>}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Metrics ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
          <Activity size={15} className="text-brand-indigo" />
          <h2 className="font-bold text-brand-text-heading font-heading">Service health</h2>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {metrics.readings.map((m) => (
            <div key={m.key} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-brand-text-heading">{m.label}</span>
                <span className={`text-sm font-bold ${m.breached ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                  {m.value}
                  {m.threshold !== null && <span className="text-brand-text-muted font-normal text-xs"> / {m.threshold}</span>}
                </span>
              </div>
              {m.breached && <p className="text-xs text-[#856404] mt-1">{m.runbook}</p>}
            </div>
          ))}
        </div>

        {/* Saying what is NOT measured matters more than the numbers above: a
            dashboard of green counters implies the rest is fine. */}
        <div className="px-5 py-3 bg-[#F8F9FA] border-t border-[#EEEEEE]">
          <p className="text-[11px] font-bold text-brand-text-muted uppercase flex items-center gap-1">
            <AlertTriangle size={11} /> Not measured here
          </p>
          {metrics.uninstrumented.map((u) => (
            <p key={u.metric} className="text-[11px] text-brand-text-muted mt-1">
              <span className="font-semibold">{u.metric}</span> — {u.why}
            </p>
          ))}
        </div>
      </div>

      {/* ── Release flags (P12.03) ─────────────────────────────────────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading">Release flags</h2>
          <p className="text-xs text-brand-text-muted mt-0.5">
            Each gates STARTING new work only — turning one off never strands an
            import, event or receipt that is already in flight.
          </p>
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {flags.map((f) => (
            <div key={f.flag} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-brand-text-heading font-semibold">{f.flag}</p>
                <p className="text-[11px] text-brand-text-muted">{f.gates}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                f.effective ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"
              }`}>
                {f.effective ? "on" : "off"}{f.overridden ? " (override)" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
