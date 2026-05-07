import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { AnalyticsService } from "@/server/services/analytics.service";
import { AlertTriangle, ArrowLeft, BarChart3, Building2, FileText, LineChart, Receipt, RefreshCw, Stethoscope } from "lucide-react";

type SchemeDetail = NonNullable<Awaited<ReturnType<typeof AnalyticsService.getSchemeDetail>>>;

function formatMoney(value: number) {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${value.toLocaleString()}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function mlrTone(value: number) {
  if (value >= 0.9) return "bg-[#DC3545]/10 text-[#DC3545]";
  if (value >= 0.75) return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#28A745]/10 text-[#28A745]";
}

function severityTone(severity: string) {
  if (severity === "CRITICAL") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (severity === "WARNING") return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#17A2B8]/10 text-[#17A2B8]";
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <p className="text-[13px] font-bold uppercase tracking-normal text-avenue-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-avenue-text-heading">{value}</p>
      <p className="mt-2 text-[13px] leading-snug text-avenue-text-muted">{detail}</p>
    </div>
  );
}

function TrendPanel({ trend }: { trend: SchemeDetail["trend"] }) {
  const max = Math.max(...trend.map((row) => Math.max(row.contribution, row.claims)), 1);
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Contribution vs Claims</h2>
          <p className="text-sm text-avenue-text-muted">Monthly movement from the analytics snapshot table.</p>
        </div>
        <LineChart className="h-5 w-5 text-avenue-indigo" />
      </div>
      <div className="space-y-3 p-5">
        {trend.length === 0 && (
          <p className="py-8 text-center text-sm text-avenue-text-muted">No snapshot trend has been generated for this scheme yet.</p>
        )}
        {trend.slice(-12).map((row) => (
          <div key={row.period} className="grid grid-cols-[64px_1fr_92px] items-center gap-3 text-[13px]">
            <span className="font-semibold text-avenue-text-muted">{row.period}</span>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-[#E6E7E8]">
                <div className="h-2 rounded-full bg-avenue-indigo" style={{ width: `${Math.max(3, (row.contribution / max) * 100)}%` }} />
              </div>
              <div className="h-2 rounded-full bg-[#E6E7E8]">
                <div className="h-2 rounded-full bg-[#DC3545]" style={{ width: `${Math.max(3, (row.claims / max) * 100)}%` }} />
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 text-center font-bold tabular-nums ${mlrTone(row.mlr)}`}>
              {formatPercent(row.mlr)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedList({
  title,
  subtitle,
  icon,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: { label: string; meta: string; value: number; count: number }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-avenue-text-heading">{title}</h2>
          <p className="text-sm text-avenue-text-muted">{subtitle}</p>
        </div>
        {icon}
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-avenue-text-muted">No rows yet.</p>
        )}
        {rows.map((row) => (
          <div key={row.label} className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-avenue-text-heading">{row.label}</p>
                <p className="text-[13px] text-avenue-text-muted">{row.meta}</p>
              </div>
              <p className="font-bold tabular-nums text-avenue-text-heading">{formatMoney(row.value)}</p>
            </div>
            <div className="h-2 rounded-full bg-[#E6E7E8]">
              <div className="h-2 rounded-full bg-avenue-indigo" style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function SchemeAnalyticsDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const { groupId } = await params;
  const detail = await AnalyticsService.getSchemeDetail({
    tenantId: session.user.tenantId,
    groupId,
  });

  if (!detail) notFound();

  const categoryRows = detail.categorySpend.map((row) => ({
    label: row.benefitCategory.replace(/_/g, " "),
    meta: `${row.encounterCount.toLocaleString()} encounter facts`,
    value: row.grossCost,
    count: row.encounterCount,
  }));
  const icdRows = detail.icdDrivers.map((row) => ({
    label: row.icdFamily,
    meta: `${row.encounterCount.toLocaleString()} encounter facts`,
    value: row.grossCost,
    count: row.encounterCount,
  }));
  const providerRows = detail.providerMix.map((row) => ({
    label: row.providerName,
    meta: `${row.providerTier ?? "UNKNOWN"} · ${row.encounterCount.toLocaleString()} encounter facts`,
    value: row.grossCost,
    count: row.encounterCount,
  }));

  return (
    <div className="space-y-6 font-ui">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/analytics" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-avenue-indigo hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to analytics
          </Link>
          <h1 className="font-heading text-3xl font-bold text-avenue-text-heading">{detail.group.name}</h1>
          <p className="text-avenue-text-muted">
            {detail.group.industry ?? "Corporate scheme"} · {detail.group.packageName} · {detail.group.intermediaryName ?? "Direct"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${mlrTone(detail.summary.mlr)}`}>
          MLR {formatPercent(detail.summary.mlr)}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contribution" value={formatMoney(detail.summary.contribution)} detail={`${formatMoney(detail.summary.paidContribution)} collected in ${detail.summary.period ?? "latest period"}`} />
        <MetricCard label="Claims" value={formatMoney(detail.summary.claims)} detail={`${formatMoney(detail.summary.grossCost)} gross billed cost`} />
        <MetricCard label="Members" value={detail.group.activeMembers.toLocaleString()} detail={`Renewal ${formatDate(detail.group.renewalDate)}`} />
        <MetricCard label="Open Alerts" value={detail.summary.alertCount.toLocaleString()} detail="Open or acknowledged analytics alerts" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendPanel trend={detail.trend} />
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Action Workspace</h2>
          <p className="mt-1 text-sm text-avenue-text-muted">Use these links to move from insight to operational follow-up.</p>
          <div className="mt-4 grid gap-2">
            <Link href={`/groups/${detail.group.id}`} className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-avenue-text-heading hover:border-avenue-indigo hover:text-avenue-indigo">
              <Building2 className="h-4 w-4" />
              Open group record
            </Link>
            <Link href={`/groups/${detail.group.id}/reprice`} className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-avenue-text-heading hover:border-avenue-indigo hover:text-avenue-indigo">
              <RefreshCw className="h-4 w-4" />
              Review repricing
            </Link>
            <Link href="/reports" className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-avenue-text-heading hover:border-avenue-indigo hover:text-avenue-indigo">
              <FileText className="h-4 w-4" />
              Open reports
            </Link>
            <Link href={`/analytics/alerts?groupId=${detail.group.id}`} className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-avenue-text-heading hover:border-avenue-indigo hover:text-avenue-indigo">
              <AlertTriangle className="h-4 w-4" />
              Open alert inbox
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RankedList title="Disease Drivers" subtitle="Top ICD families by gross cost." icon={<Stethoscope className="h-5 w-5 text-[#DC3545]" />} rows={icdRows} />
        <RankedList title="Benefit Mix" subtitle="Cost by benefit category." icon={<Receipt className="h-5 w-5 text-[#17A2B8]" />} rows={categoryRows} />
        <RankedList title="Provider Mix" subtitle="Providers driving scheme cost." icon={<Building2 className="h-5 w-5 text-avenue-indigo" />} rows={providerRows} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-[#EEEEEE] px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Current Alerts</h2>
              <p className="text-sm text-avenue-text-muted">Open and acknowledged alerts scoped to this scheme.</p>
            </div>
            <Link href={`/analytics/alerts?groupId=${detail.group.id}`} className="text-sm font-semibold text-avenue-indigo hover:underline">
              Manage
            </Link>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {detail.alerts.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-avenue-text-muted">No active alerts for this scheme.</p>
            )}
            {detail.alerts.map((alert) => (
              <Link key={alert.id} href={`/analytics/alerts?groupId=${detail.group.id}`} className="block px-5 py-4 hover:bg-[#F8F9FA]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-semibold text-avenue-text-heading">{alert.title}</p>
                  <span className={`rounded-full px-2 py-1 text-[13px] font-bold ${severityTone(alert.severity)}`}>{alert.severity}</span>
                </div>
                <p className="text-sm text-avenue-text-muted">{alert.message}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Recent Claims</h2>
            <p className="text-sm text-avenue-text-muted">Named claim rows are internal-only and should be role-scoped before wider exposure.</p>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {detail.recentClaims.map((claim) => (
              <Link key={claim.id} href={`/claims/${claim.id}`} className="block px-5 py-4 hover:bg-[#F8F9FA]">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-avenue-text-heading">{claim.claimNumber}</p>
                    <p className="truncate text-[13px] text-avenue-text-muted">{claim.memberName} · {claim.providerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums text-avenue-text-heading">{formatMoney(claim.approvedAmount)}</p>
                    <p className="text-[13px] text-avenue-text-muted">{claim.status.replace(/_/g, " ")}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {detail.renewalAnalysis && (
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Renewal Recommendation</h2>
              <p className="text-sm text-avenue-text-muted">Deterministic pricing signal from the renewal analysis table.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-avenue-indigo" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Trailing MLR" value={formatPercent(detail.renewalAnalysis.trailing12Mlr)} detail={`Target ${formatPercent(detail.renewalAnalysis.targetMlr)}`} />
            <MetricCard label="Projected Claims" value={formatMoney(detail.renewalAnalysis.projectedClaims)} detail="Includes seeded inflation assumption" />
            <MetricCard label="Recommended Contribution" value={formatMoney(detail.renewalAnalysis.recommendedContribution)} detail="Before actuarial/product review" />
            <MetricCard label="Adjustment" value={formatPercent(detail.renewalAnalysis.recommendedAdjustmentPct)} detail="Indicative pricing movement" />
          </div>
          <Link href={`/analytics/renewals/${detail.group.id}`} className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-avenue-indigo px-4 py-2 text-sm font-semibold text-white hover:bg-avenue-indigo/90">
            <RefreshCw className="h-4 w-4" />
            Open renewal workspace
          </Link>
        </div>
      )}
    </div>
  );
}
