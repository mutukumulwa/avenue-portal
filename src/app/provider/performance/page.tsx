import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Info } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderPerformanceScoreService } from "@/server/services/provider-performance/score.service";
import { ProviderImprovementPlanService } from "@/server/services/provider-improvement-plan/service";

/**
 * PNOS F8.5 — provider performance dashboard (§8.13 provider view; D21 advisory).
 *
 * The provider sees its OWN published, sufficiently-sampled scores (F8.2 read model —
 * unpublished/incomplete/under-sample are already excluded), each with its definition
 * version, sample size, completeness, and a data-quality warning; the anonymized peer
 * benchmark for its OWN cohort (F8.4 — distribution + peer-group size, NEVER a named
 * peer); a drilldown to its OWN source records; links to its human improvement plans;
 * and an explicit "advisory, not a sanction" warning. No automatic action.
 */
export default async function ProviderPerformance() {
  const { ctx } = await ProviderAccessService.resolveUserContext();

  let scores: Awaited<ReturnType<typeof ProviderPerformanceScoreService.listForProvider>>;
  try {
    scores = await ProviderPerformanceScoreService.listForProvider(ctx);
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }

  const latestPeriod = scores[0]?.period ?? null; // listForProvider orders period desc
  const latest = scores.filter((s) => s.period === latestPeriod);
  const benchmarks = await Promise.all(latest.map((s) => ProviderPerformanceScoreService.getCohortBenchmarkForProvider(ctx, { metricKey: s.metricKey, period: s.period })));
  const benchByMetric = new Map(latest.map((s, i) => [s.metricKey, benchmarks[i]]));
  const plans = await ProviderImprovementPlanService.listForProvider(ctx).catch(() => []);

  const fmt = (v: string | null, unit: string) => (v == null ? "—" : unit === "RATE" ? `${(Number(v) * 100).toFixed(1)}%` : Number(v).toLocaleString());
  const metricLabel = (k: string) => k.replace(/^[A-Z]\d+_/, "").replace(/_/g, " ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><BarChart3 size={22} /> Performance</h1>
        {latestPeriod && <span className="text-sm text-brand-text-muted">Period {latestPeriod}</span>}
      </div>

      {/* Advisory warning — never a sanction (§8.13 / D21) */}
      <div className="bg-[#E7F1FF] border border-[#B6D4FE] rounded-lg px-5 py-3 flex items-start gap-3" role="note">
        <Info size={18} className="text-brand-indigo mt-0.5 shrink-0" />
        <p className="text-sm text-brand-text-body">These scores are <span className="font-semibold">advisory</span> — a shared, transparent view to support improvement conversations. They never trigger a suspension, rate change, or tier change. Benchmarks are anonymized peer distributions; no other provider is identified.</p>
      </div>

      {latest.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-lg px-5 py-12 text-center text-brand-text-muted text-sm">No published performance scores yet for your facility.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {latest.map((s) => {
            const b = benchByMetric.get(s.metricKey);
            return (
              <section key={s.metricKey} className="bg-white border border-[#EEEEEE] rounded-lg p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-brand-text-heading capitalize">{metricLabel(s.metricKey)}</h2>
                  <span className="text-lg font-bold text-brand-indigo">{fmt(s.value, s.unit)}</span>
                </div>
                <p className="text-[11px] text-brand-text-muted mt-1">
                  {s.numerator} / {s.denominator} · sample {s.sampleSize} · {s.definitionVersion}
                  {s.dataQualityWarning && <span className="ml-1 text-[#856404] font-semibold">· partial data</span>}
                </p>
                {b ? (
                  <p className="text-xs text-brand-text-body mt-2">
                    Peer group ({b.peerGroupSize}): median <span className="font-semibold">{fmt(b.median, b.unit)}</span> · range {fmt(b.min, b.unit)}–{fmt(b.max, b.unit)}
                  </p>
                ) : (
                  <p className="text-xs text-brand-text-muted mt-2">No peer benchmark — the peer group is too small to compare anonymously.</p>
                )}
                <Link href={`/provider/claims?period=${s.period}`} className="inline-block text-xs text-brand-indigo underline mt-2">View your contributing records</Link>
              </section>
            );
          })}
        </div>
      )}

      {/* Improvement plans (F7.7) */}
      {plans.length > 0 && (
        <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
          <h2 className="px-5 py-2.5 text-[11px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">Improvement plans</h2>
          <ul className="divide-y divide-[#F4F4F4]">
            {plans.map((p) => (
              <li key={p.id} className="px-5 py-2.5 text-sm flex items-center justify-between gap-2">
                <span className="font-medium text-brand-text-heading">{p.title}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-indigo/10 text-brand-indigo">{p.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
