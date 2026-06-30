import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, Calculator, FileText, RefreshCw, Stethoscope, Users, Cpu, CheckCircle2, Send } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";
import { renewalService } from "@/server/services/renewal.service";
import { prisma } from "@/lib/prisma";
import {
  computeIntelligenceAction, saveScenarioAction,
  commitScenarioAction, dispatchNoticeAction,
} from "./renewal-actions";

type SearchParams = {
  targetMlr?: string;
  inflation?: string;
  membership?: string;
  adjustment?: string;
  from?: string;
};

type RenewalWorkspace = NonNullable<Awaited<ReturnType<typeof AnalyticsService.getRenewalWorkspace>>>;

function numberParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${Math.round(value).toLocaleString("en-KE")}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(value: Date) {
  return Math.ceil((value.getTime() - Date.now()) / 86_400_000);
}

function metricTone(value: number, target: number) {
  if (value > target + 0.1) return "bg-[#DC3545]/10 text-[#DC3545]";
  if (value > target) return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#28A745]/10 text-[#28A745]";
}

function severityTone(severity: string) {
  if (severity === "CRITICAL") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (severity === "WARNING") return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#17A2B8]/10 text-[#17A2B8]";
}

function jsonText(row: unknown, key: string, fallback = "Unknown") {
  if (!row || typeof row !== "object") return fallback;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

function jsonNumber(row: unknown, key: string) {
  if (!row || typeof row !== "object") return 0;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <p className="text-[13px] font-bold uppercase tracking-normal text-brand-text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone ?? "text-brand-text-heading"}`}>{value}</p>
      <p className="mt-2 text-[13px] leading-snug text-brand-text-muted">{detail}</p>
    </div>
  );
}

function TrendPanel({ trend, targetMlr }: { trend: RenewalWorkspace["trend"]; targetMlr: number }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">MLR Trend</h2>
          <p className="text-sm text-brand-text-muted">Last 12 refreshed scheme periods against the pricing target.</p>
        </div>
        <BarChart3 className="h-5 w-5 text-brand-indigo" />
      </div>
      <div className="space-y-3 p-5">
        {trend.length === 0 && <p className="py-8 text-center text-sm text-brand-text-muted">No trend rows yet.</p>}
        {trend.map((row) => (
          <div key={row.period} className="grid grid-cols-[64px_1fr_92px] items-center gap-3 text-[13px]">
            <span className="font-semibold text-brand-text-muted">{row.period}</span>
            <div className="h-2 rounded-full bg-[#E6E7E8]">
              <div className="h-2 rounded-full bg-brand-indigo" style={{ width: `${Math.max(3, Math.min(100, row.mlr * 100))}%` }} />
            </div>
            <span className={`rounded-full px-2 py-1 text-center font-bold tabular-nums ${metricTone(row.mlr, targetMlr)}`}>
              {formatPercent(row.mlr)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenewalSimulator({ workspace }: { workspace: RenewalWorkspace }) {
  const { simulation, analysis } = workspace;
  const contributionTone = simulation.surplusShortfall >= 0 ? "text-[#28A745]" : "text-[#DC3545]";

  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Renewal Simulator</h2>
          <p className="text-sm text-brand-text-muted">Scenario assumptions are applied against the stored renewal analysis.</p>
        </div>
        <Calculator className="h-5 w-5 text-brand-indigo" />
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-[320px_1fr]">
        <form className="grid gap-3" method="get">
          <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
            Target MLR %
            <input name="targetMlr" type="number" min="45" max="95" step="0.5" defaultValue={(simulation.assumptions.targetMlr * 100).toFixed(1)} className="h-10 rounded-[8px] border border-[#EEEEEE] px-3 outline-none focus:border-brand-indigo" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
            Inflation %
            <input name="inflation" type="number" min="-20" max="60" step="0.5" defaultValue={(simulation.assumptions.inflationAssumption * 100).toFixed(1)} className="h-10 rounded-[8px] border border-[#EEEEEE] px-3 outline-none focus:border-brand-indigo" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
            Membership Change %
            <input name="membership" type="number" min="-50" max="100" step="1" defaultValue={(simulation.assumptions.membershipChangePct * 100).toFixed(1)} className="h-10 rounded-[8px] border border-[#EEEEEE] px-3 outline-none focus:border-brand-indigo" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-brand-text-heading">
            Proposed Contribution Change %
            <input name="adjustment" type="number" min="-50" max="150" step="0.5" defaultValue={(simulation.assumptions.contributionAdjustmentPct * 100).toFixed(1)} className="h-10 rounded-[8px] border border-[#EEEEEE] px-3 outline-none focus:border-brand-indigo" />
          </label>
          <button className="mt-1 inline-flex items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-brand-indigo/90">
            <RefreshCw className="h-4 w-4" />
            Run scenario
          </button>
        </form>

        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Projected Claims" value={formatMoney(simulation.projectedClaims)} detail={`Inflation ${formatPercent(simulation.assumptions.inflationAssumption)}, members ${simulation.activeMembers.toLocaleString()}`} />
          <MetricCard label="Required Contribution" value={formatMoney(simulation.requiredContribution)} detail={`To reach target MLR ${formatPercent(simulation.assumptions.targetMlr)}`} />
          <MetricCard label="Proposed Contribution" value={formatMoney(simulation.proposedContribution)} detail={`${formatPercent(simulation.assumptions.contributionAdjustmentPct)} change on current contribution`} />
          <MetricCard label="Projected MLR" value={formatPercent(simulation.projectedMlr)} detail={`Break-even adjustment ${formatPercent(simulation.breakEvenAdjustmentPct)}`} tone={simulation.projectedMlr > analysis.targetMlr ? "text-[#DC3545]" : "text-[#28A745]"} />
          <MetricCard label="Rate Per Member" value={formatMoney(simulation.proposedRatePerMember)} detail={`Required rate ${formatMoney(simulation.requiredRatePerMember)}`} />
          <MetricCard label="Surplus / Shortfall" value={formatMoney(simulation.surplusShortfall)} detail="Proposed contribution less required contribution" tone={contributionTone} />
        </div>
      </div>
    </div>
  );
}

function DriverPanel({ workspace }: { workspace: RenewalWorkspace }) {
  const drivers = workspace.analysis.topIcdDrivers;
  const utilizers = workspace.analysis.anonymizedTopUtilizers;
  const maxDriver = Math.max(...drivers.map((row) => jsonNumber(row, "grossCost")), 1);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Disease Drivers</h2>
            <p className="text-sm text-brand-text-muted">Top ICD families from the trailing analysis period.</p>
          </div>
          <Stethoscope className="h-5 w-5 text-[#DC3545]" />
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {drivers.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No ICD drivers yet.</p>}
          {drivers.map((row, index) => {
            const grossCost = jsonNumber(row, "grossCost");
            return (
              <div key={`${jsonText(row, "icdFamily")}-${index}`} className="px-5 py-4">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-brand-text-heading">{jsonText(row, "icdFamily")}</p>
                    <p className="text-[13px] text-brand-text-muted">{jsonNumber(row, "encounterCount").toLocaleString()} encounter facts</p>
                  </div>
                  <p className="font-bold tabular-nums text-brand-text-heading">{formatMoney(grossCost)}</p>
                </div>
                <div className="h-2 rounded-full bg-[#E6E7E8]">
                  <div className="h-2 rounded-full bg-brand-indigo" style={{ width: `${Math.max(3, (grossCost / maxDriver) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">High Utilizers</h2>
            <p className="text-sm text-brand-text-muted">Anonymized internal pricing signal; no member names exposed here.</p>
          </div>
          <Users className="h-5 w-5 text-[#17A2B8]" />
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {utilizers.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No high utilizer rows yet.</p>}
          {utilizers.map((row, index) => (
            <div key={`${jsonText(row, "memberHash")}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4">
              <div>
                <p className="font-semibold text-brand-text-heading">{jsonText(row, "label", `Member ${index + 1}`)}</p>
                <p className="text-[13px] text-brand-text-muted">Hash {jsonText(row, "memberHash")} · {jsonNumber(row, "encounterCount").toLocaleString()} encounter facts</p>
              </div>
              <p className="font-bold tabular-nums text-brand-text-heading">{formatMoney(jsonNumber(row, "grossCost"))}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function RenewalWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const { groupId } = await params;
  const query = await searchParams;
  const scope = await getAnalyticsAccessScope(session);
  const defaults = {
    targetMlr: 75,
    inflation: 8,
    membership: 0,
    adjustment: 0,
  };
  const workspace = await AnalyticsService.getRenewalWorkspace({
    ...scope,
    groupId,
  }, {
    targetMlr: numberParam(query.targetMlr, defaults.targetMlr) / 100,
    inflationAssumption: numberParam(query.inflation, defaults.inflation) / 100,
    membershipChangePct: numberParam(query.membership, defaults.membership) / 100,
    contributionAdjustmentPct: numberParam(query.adjustment, defaults.adjustment) / 100,
  });

  if (!workspace) notFound();

  // Process 11: spec algorithm recommendation + saved scenarios + group renewal status
  const [enrichedAnalysis, savedScenarios, groupStatus] = await Promise.all([
    prisma.renewalAnalysis.findFirst({
      where: { tenantId: scope.tenantId, groupId },
      orderBy: { renewalDate: "asc" },
      select: { id: true, recommendationBasis: true, requiresActuarialReview: true, isLossLeader: true },
    }),
    renewalService.getScenariosForAnalysis(workspace.analysis.id, scope.tenantId),
    prisma.group.findUnique({
      where: { id: groupId },
      select: { renewalStatus: true, renewalNoticeDispatchedAt: true, priorPeriodReconciled: true },
    }),
  ]);

  const daysToRenewal = daysUntil(workspace.analysis.renewalDate);
  const recommendationTone = workspace.analysis.recommendedAdjustmentPct > 0.15 ? "text-[#DC3545]" : workspace.analysis.recommendedAdjustmentPct > 0 ? "text-[#856404]" : "text-[#28A745]";

  return (
    <div className="space-y-6 font-ui">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={query.from === "report" ? "/reports" : query.from === "scheme" ? `/analytics/schemes/${groupId}` : "/analytics"}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {query.from === "report" ? "Back to reports" : query.from === "scheme" ? "Back to scheme" : "Back to analytics"}
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-indigo">
            <RefreshCw className="h-4 w-4" />
            Renewal Intelligence
          </div>
          <h1 className="mt-1 font-heading text-3xl font-bold text-brand-text-heading">{workspace.group.name}</h1>
          <p className="text-brand-text-muted">
            {workspace.group.packageName} · {workspace.group.intermediaryName ?? "Direct"} · Renews {formatDate(workspace.analysis.renewalDate)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${daysToRenewal <= 14 ? "bg-[#DC3545]/10 text-[#DC3545]" : "bg-[#17A2B8]/10 text-[#17A2B8]"}`}>
          {daysToRenewal} days
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/groups/${workspace.group.id}/reprice`} className="inline-flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
          <RefreshCw className="h-4 w-4" />
          Operational repricing
        </Link>
        <Link href="/quotations/calculator" className="inline-flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
          <FileText className="h-4 w-4" />
          Start renewal quote
        </Link>
        <Link href={`/analytics/alerts?groupId=${workspace.group.id}`} className="inline-flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
          <AlertTriangle className="h-4 w-4" />
          Review alerts
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Trailing MLR" value={formatPercent(workspace.analysis.trailing12Mlr)} detail={`Target ${formatPercent(workspace.analysis.targetMlr)}`} tone={workspace.analysis.trailing12Mlr > workspace.analysis.targetMlr ? "text-[#DC3545]" : "text-[#28A745]"} />
        <MetricCard label="Current-Year MLR" value={formatPercent(workspace.analysis.currentYearMlr)} detail="Current calendar year performance" tone={workspace.analysis.currentYearMlr > workspace.analysis.targetMlr ? "text-[#DC3545]" : "text-[#28A745]"} />
        <MetricCard label="Current Contribution" value={formatMoney(workspace.analysis.currentContribution)} detail={`${workspace.group.activeMembers.toLocaleString()} active lives`} />
        <MetricCard label="Recommended Change" value={formatPercent(workspace.analysis.recommendedAdjustmentPct)} detail={`Recommended ${formatMoney(workspace.analysis.recommendedContribution)}`} tone={recommendationTone} />
      </div>

      <RenewalSimulator workspace={workspace} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendPanel trend={workspace.trend} targetMlr={workspace.analysis.targetMlr} />
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Renewal Alerts</h2>
            <p className="text-sm text-brand-text-muted">Open renewal, MLR, and contribution signals.</p>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {workspace.alerts.length === 0 && <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No active renewal alerts.</p>}
            {workspace.alerts.map((alert) => (
              <Link key={alert.id} href={`/analytics/alerts?groupId=${workspace.group.id}`} className="block px-5 py-4 hover:bg-[#F8F9FA]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-semibold text-brand-text-heading">{alert.title}</p>
                  <span className={`rounded-full px-2 py-1 text-[13px] font-bold ${severityTone(alert.severity)}`}>{alert.severity}</span>
                </div>
                <p className="text-sm text-brand-text-muted">{alert.message}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <DriverPanel workspace={workspace} />

      {/* ── Process 11: Spec algorithm recommendation ──────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading flex items-center gap-2">
            <Cpu size={15} className="text-brand-indigo" /> Renewal Intelligence — Spec Algorithm
          </h2>
          <form action={computeIntelligenceAction}>
            <input type="hidden" name="groupId" value={groupId} />
            <button type="submit"
              className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1 rounded-full hover:bg-brand-indigo/5 transition-colors flex items-center gap-1">
              <RefreshCw size={11} /> Recompute
            </button>
          </form>
        </div>

        {enrichedAnalysis?.recommendationBasis ? (
          <div className="space-y-3">
            <div className={`rounded-[8px] p-4 border ${enrichedAnalysis.requiresActuarialReview ? "bg-[#DC3545]/10 border-[#DC3545]/30" : "bg-[#F8F9FF] border-brand-indigo/20"}`}>
              <p className={`text-sm font-semibold mb-1 ${enrichedAnalysis.requiresActuarialReview ? "text-[#DC3545]" : "text-brand-indigo"}`}>
                {enrichedAnalysis.requiresActuarialReview
                  ? "⚠ Actuarial review required — MLR > target × 1.20"
                  : "Recommendation"}
              </p>
              <p className="text-sm text-brand-text-body">{enrichedAnalysis.recommendationBasis}</p>
            </div>
            {enrichedAnalysis.isLossLeader && (
              <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[6px] p-3 text-xs text-[#856404]">
                <strong>Loss leader</strong> — scheme is being priced below technical rate for strategic reasons.
                Senior Assessor sign-off with documented justification required before renewal.
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-brand-text-muted">
            Click <strong>Recompute</strong> to run the spec §11 algorithm and generate a recommendation.
          </p>
        )}
      </div>

      {/* ── Process 11: Scenario save / commit ─────────────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-brand-text-heading text-sm font-heading flex items-center gap-2">
          <Calculator size={15} className="text-brand-indigo" /> Save Scenario
        </h2>
        <p className="text-xs text-brand-text-muted">
          Save the current simulator parameters as a named scenario for comparison.
          Scenarios do not modify the scheme — only a committed scenario feeds into the renewal quotation.
        </p>

        {enrichedAnalysis && (
          <form action={saveScenarioAction} className="flex flex-wrap gap-3 items-end">
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="renewalAnalysisId" value={enrichedAnalysis.id} />
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Scenario name</label>
              <input name="scenarioName" type="text" placeholder={`Scenario ${new Date().toLocaleDateString("en-KE")}`}
                className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none w-52" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Rate adjustment (%)</label>
              <input name="proposedRateAdj" type="number" step={0.5} placeholder="e.g. 5 for +5%"
                className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none w-36" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Co-contrib adj (%)</label>
              <input name="proposedCoContribAdj" type="number" step={0.5} placeholder="optional"
                className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none w-32" />
            </div>
            <button type="submit"
              className="bg-brand-indigo text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-brand-secondary transition-colors">
              Save Scenario
            </button>
          </form>
        )}

        {/* Saved scenarios list */}
        {savedScenarios.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-brand-text-muted tracking-wide">Saved Scenarios</p>
            {savedScenarios.map((s) => (
              <div key={s.id} className={`flex items-center justify-between border rounded-[6px] px-4 py-2.5 ${s.isCommitted ? "border-[#28A745]/30 bg-[#28A745]/5" : "border-[#EEEEEE]"}`}>
                <div>
                  <p className="text-sm font-semibold text-brand-text-heading">{s.scenarioName}</p>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    Rate adj: {(Number(s.proposedRateAdj) * 100).toFixed(1)}% ·
                    Projected MLR: {(Number(s.projectedMlr) * 100).toFixed(1)}% ·
                    Contribution: KES {Number(s.projectedContribution).toLocaleString("en-KE")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.isCommitted ? (
                    <span className="text-[10px] font-bold text-[#28A745] flex items-center gap-1">
                      <CheckCircle2 size={11} /> Committed
                    </span>
                  ) : (
                    <form action={commitScenarioAction}>
                      <input type="hidden" name="groupId" value={groupId} />
                      <input type="hidden" name="scenarioId" value={s.id} />
                      <button type="submit"
                        className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1 rounded-full hover:bg-brand-indigo/5 transition-colors">
                        Commit
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Process 11: Pipeline status & notice dispatch ───── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-brand-text-heading text-sm font-heading flex items-center gap-2">
          <Send size={15} className="text-brand-indigo" /> Pipeline Status
        </h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-brand-text-muted">Renewal status</p>
            <p className="font-semibold text-brand-text-heading mt-0.5">
              {groupStatus?.renewalStatus?.replace(/_/g," ") ?? "Not started"}
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-text-muted">Notice dispatched</p>
            <p className="font-semibold text-brand-text-heading mt-0.5">
              {groupStatus?.renewalNoticeDispatchedAt
                ? new Date(groupStatus.renewalNoticeDispatchedAt).toLocaleDateString("en-KE")
                : "Not yet"}
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-text-muted">Prior period reconciled</p>
            <p className={`font-semibold mt-0.5 ${groupStatus?.priorPeriodReconciled ? "text-[#28A745]" : "text-[#856404]"}`}>
              {groupStatus?.priorPeriodReconciled ? "Yes" : "No — required before binding"}
            </p>
          </div>
        </div>
        {!groupStatus?.renewalNoticeDispatchedAt && (
          <form action={dispatchNoticeAction}>
            <input type="hidden" name="groupId" value={groupId} />
            <button type="submit"
              className="border border-brand-indigo text-brand-indigo px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-indigo hover:text-white transition-colors flex items-center gap-2">
              <Send size={13} /> Dispatch Renewal Notice
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
