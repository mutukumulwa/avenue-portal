import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";
import { AlertTriangle, BarChart3, Building2, CalendarClock, Gauge, HeartPulse, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

function formatMoney(value: number) {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${value.toLocaleString()}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusTone(mlr: number) {
  if (mlr >= 0.9) return "text-[#DC3545] bg-[#DC3545]/10";
  if (mlr >= 0.75) return "text-[#FFC107] bg-[#FFC107]/15";
  return "text-[#28A745] bg-[#28A745]/10";
}

function MetricStrip({
  summary,
}: {
  summary: Awaited<ReturnType<typeof AnalyticsService.getPortfolioSummary>>;
}) {
  const metrics = [
    {
      label: "Portfolio MLR",
      value: formatPercent(summary.portfolioMlr),
      detail: summary.period ? `Latest monthly run-rate period ${summary.period}` : "Awaiting analytics refresh",
      icon: Gauge,
      tone: statusTone(summary.portfolioMlr),
    },
    {
      label: "Covered Members",
      value: summary.activeMembers.toLocaleString(),
      detail: "Active lives",
      icon: Users,
      tone: "text-brand-indigo bg-brand-indigo/10",
    },
    {
      label: "Contribution YTD",
      value: formatMoney(summary.contributionYtd),
      detail: `${formatMoney(summary.paidContributionYtd)} collected YTD`,
      icon: TrendingUp,
      tone: "text-[#17A2B8] bg-[#17A2B8]/10",
    },
    {
      label: "Open Alerts",
      value: summary.openAlerts.toLocaleString(),
      detail: `${summary.claimCountYtd.toLocaleString()} YTD claim facts`,
      icon: AlertTriangle,
      tone: summary.openAlerts > 0 ? "text-[#DC3545] bg-[#DC3545]/10" : "text-[#28A745] bg-[#28A745]/10",
      href: "/analytics/alerts",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm font-ui">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold uppercase tracking-normal text-brand-text-muted">{metric.label}</p>
                {metric.href ? (
                  <Link href={metric.href} className="mt-2 block text-2xl font-bold tabular-nums text-brand-text-heading hover:text-brand-indigo hover:underline">
                    {metric.value}
                  </Link>
                ) : (
                  <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{metric.value}</p>
                )}
              </div>
              <div className={`rounded-[8px] p-2 ${metric.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-brand-text-muted">{metric.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function MiniSparkline({ values }: { values: { mlr: number }[] }) {
  const points = values.length > 0 ? values : [{ mlr: 0 }];
  return (
    <div className="flex h-9 items-end gap-1">
      {points.map((point, index) => (
        <span
          key={index}
          className="block w-2 rounded-t bg-brand-indigo/60"
          style={{ height: `${Math.max(6, Math.min(36, point.mlr * 36))}px` }}
        />
      ))}
    </div>
  );
}

function SchemeGrid({
  schemes,
}: {
  schemes: Awaited<ReturnType<typeof AnalyticsService.getSchemeGrid>>;
}) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Scheme Performance</h2>
          <p className="text-sm text-brand-text-muted">Latest monthly run-rate contribution, collected amounts, claims pressure, and alert signals by scheme.</p>
        </div>
        <Building2 className="h-5 w-5 text-brand-indigo" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm font-ui">
          <thead className="border-b border-[#EEEEEE] bg-[#F8F9FA] text-[13px] uppercase tracking-normal text-brand-text-muted">
            <tr>
              <th className="px-5 py-3 font-bold">Scheme</th>
              <th className="px-5 py-3 font-bold">Members</th>
              <th className="px-5 py-3 font-bold">Monthly Contribution</th>
              <th className="px-5 py-3 font-bold">Monthly Claims</th>
              <th className="px-5 py-3 font-bold">Monthly MLR</th>
              <th className="px-5 py-3 font-bold">Trend</th>
              <th className="px-5 py-3 font-bold">Alerts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {schemes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                  No analytics snapshots yet. Run the analytics refresh after applying the migration.
                </td>
              </tr>
            )}
            {schemes.map((scheme) => (
              <tr key={scheme.groupId} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-4">
                  <Link href={`/analytics/schemes/${scheme.groupId}`} className="font-semibold text-brand-text-heading hover:text-brand-indigo hover:underline">
                    {scheme.name}
                  </Link>
                  <p className="text-[13px] leading-snug text-brand-text-muted">{scheme.intermediaryName ?? "Direct"} · Run-rate period {scheme.period ?? "not refreshed"}</p>
                </td>
                <td className="px-5 py-4 tabular-nums">{scheme.memberCount.toLocaleString()}</td>
                <td className="px-5 py-4 tabular-nums">
                  <p>{formatMoney(scheme.contribution)}</p>
                  <p className="text-[13px] leading-snug text-brand-text-muted">{formatMoney(scheme.paidContribution)} collected</p>
                </td>
                <td className="px-5 py-4 tabular-nums">{formatMoney(scheme.claims)}</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2 py-1 text-[13px] font-bold tabular-nums tracking-normal ${statusTone(scheme.mlr)}`}>
                    {formatPercent(scheme.mlr)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <MiniSparkline values={scheme.sparkline} />
                </td>
                <td className="px-5 py-4">
                  <Link href={`/analytics/alerts?groupId=${scheme.groupId}`} className="rounded-full bg-brand-bg-alt px-2 py-1 text-[13px] font-bold text-brand-text-heading hover:text-brand-indigo hover:underline">
                    {scheme.alertCount}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderGrid({
  providers,
}: {
  providers: Awaited<ReturnType<typeof AnalyticsService.getProviderScorecard>>;
}) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm font-ui">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Provider Scorecard</h2>
          <p className="text-sm text-brand-text-muted">Ranked by case-mix-adjusted cost in the latest refreshed period.</p>
        </div>
        <HeartPulse className="h-5 w-5 text-[#DC3545]" />
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {providers.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">Provider scorecards will appear after encounter facts are refreshed.</p>
        )}
        {providers.slice(0, 8).map((provider, index) => (
          <Link key={provider.id} href={`/analytics/providers/${provider.providerId}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 hover:bg-[#F8F9FA]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand-indigo/10 text-[13px] font-bold text-brand-indigo">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-text-heading hover:text-brand-indigo">{provider.providerName}</p>
              <p className="text-[13px] leading-snug text-brand-text-muted">
                {provider.providerTier ?? "UNKNOWN"} · {provider.claimCount.toLocaleString()} claims · CMI {Number(provider.caseMixIndex).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums text-brand-text-heading">{formatMoney(Number(provider.adjustedCost))}</p>
              <p className="text-[13px] leading-snug text-brand-text-muted">{formatPercent(Number(provider.rejectionRate))} rejected</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RiskComposition({
  tiers,
}: {
  tiers: Awaited<ReturnType<typeof AnalyticsService.getRiskComposition>>;
}) {
  const tone: Record<string, string> = {
    LOW: "bg-[#28A745]",
    MODERATE: "bg-[#17A2B8]",
    HIGH: "bg-[#FFC107]",
    CRITICAL: "bg-[#DC3545]",
  };

  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm font-ui">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Risk Composition</h2>
          <p className="text-sm text-brand-text-muted">Member risk tiers from the analytics profile table.</p>
        </div>
        <Link href="/analytics/risk" className="text-sm font-semibold text-brand-indigo hover:underline">
          View workbench
        </Link>
      </div>
      <div className="space-y-4">
        {tiers.length === 0 && (
          <p className="py-8 text-center text-sm text-brand-text-muted">Risk profiles have not been generated yet.</p>
        )}
        {tiers.map((tier) => (
          <Link key={tier.riskTier} href={`/analytics/risk?tier=${tier.riskTier}`} className="block rounded-[8px] p-2 -mx-2 hover:bg-[#F8F9FA]">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-brand-text-heading">{tier.riskTier.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-brand-text-muted">{tier.count.toLocaleString()} · {formatPercent(tier.percentage)}</span>
            </div>
            <div className="h-2 rounded-full bg-[#E6E7E8]">
              <div className={`h-2 rounded-full ${tone[tier.riskTier] ?? "bg-brand-indigo"}`} style={{ width: `${Math.max(3, tier.percentage * 100)}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RenewalPipeline({
  renewals,
}: {
  renewals: Awaited<ReturnType<typeof AnalyticsService.getRenewalPipeline>>;
}) {
  const urgencyTone = (days: number) => {
    if (days <= 14) return "bg-[#DC3545]/10 text-[#DC3545]";
    if (days <= 30) return "bg-[#FFC107]/15 text-[#856404]";
    return "bg-[#17A2B8]/10 text-[#17A2B8]";
  };

  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm font-ui">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Renewal Watch</h2>
          <p className="text-sm text-brand-text-muted">Schemes due in the next 90 days with pricing pressure signals.</p>
        </div>
        <CalendarClock className="h-5 w-5 text-[#FFC107]" />
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {renewals.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">Renewal analyses will appear after the analytics refresh runs for schemes renewing in the next 90 days.</p>
        )}
        {renewals.slice(0, 5).map((renewal) => (
          <Link key={renewal.analysisId} href={`/analytics/renewals/${renewal.groupId}`} className="block px-5 py-4 hover:bg-[#F8F9FA]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-text-heading">{renewal.groupName}</p>
                <p className="text-[13px] leading-snug text-brand-text-muted">
                  {renewal.intermediaryName ?? "Direct"} · {renewal.activeMembers.toLocaleString()} members
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[13px] font-bold tracking-normal ${urgencyTone(renewal.daysToRenewal)}`}>
                {renewal.daysToRenewal}d
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[13px]">
              <div>
                <p className="text-brand-text-muted">MLR</p>
                <p className={`font-bold tabular-nums ${renewal.trailing12Mlr > renewal.targetMlr ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                  {formatPercent(renewal.trailing12Mlr)}
                </p>
              </div>
              <div>
                <p className="text-brand-text-muted">Target</p>
                <p className="font-bold tabular-nums text-brand-text-heading">{formatPercent(renewal.targetMlr)}</p>
              </div>
              <div>
                <p className="text-brand-text-muted">Adjustment</p>
                <p className={`font-bold tabular-nums ${renewal.recommendedAdjustmentPct > 0 ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                  {formatPercent(renewal.recommendedAdjustmentPct)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-snug text-brand-text-muted">
              Recommended contribution {formatMoney(renewal.recommendedContribution)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function StrategicPurchasingAnalyticsPage() {
  const session = await requireRole(ROLES.ANY_STAFF);
  const scope = await getAnalyticsAccessScope(session);

  const [summary, schemes, providers, riskComposition, renewalPipeline] = await Promise.all([
    AnalyticsService.getPortfolioSummary(scope),
    AnalyticsService.getSchemeGrid(scope),
    AnalyticsService.getProviderScorecard(scope, 12),
    AnalyticsService.getRiskComposition(scope),
    AnalyticsService.getRenewalPipeline(scope),
  ]);

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-indigo">
          <BarChart3 className="h-4 w-4" />
          Strategic Purchasing
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold text-brand-text-heading">Strategic Purchasing Console</h1>
          <p className="text-brand-text-muted">Portfolio MLR, monthly scheme run-rate performance, provider efficiency, and risk signals.</p>
        </div>
      </div>

      <MetricStrip summary={summary} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SchemeGrid schemes={schemes} />
        </div>
        <div className="space-y-4">
          <RiskComposition tiers={riskComposition} />
          <RenewalPipeline renewals={renewalPipeline} />
        </div>
      </div>

      <ProviderGrid providers={providers} />
    </div>
  );
}
