import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";
import {
  AlertTriangle, ArrowLeft, Building, FileText,
  Stethoscope, Receipt, Activity, TrendingUp,
} from "lucide-react";

type ProviderDetail = NonNullable<Awaited<ReturnType<typeof AnalyticsService.getProviderDetail>>>;

function formatMoney(value: number) {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${value.toLocaleString()}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function tierTone(tier: string | null) {
  if (tier === "OWN") return "bg-brand-indigo/10 text-brand-indigo";
  if (tier === "PANEL") return "bg-[#28A745]/10 text-[#28A745]";
  if (tier === "PARTNER") return "bg-[#17A2B8]/10 text-[#17A2B8]";
  return "bg-[#6C757D]/10 text-[#6C757D]";
}

function severityTone(severity: string) {
  if (severity === "CRITICAL") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (severity === "WARNING") return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#17A2B8]/10 text-[#17A2B8]";
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "PARTIALLY_APPROVED" || status === "PAID") return "text-[#28A745]";
  if (status === "DECLINED" || status === "VOID") return "text-[#DC3545]";
  return "text-brand-text-muted";
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <p className="text-[13px] font-bold uppercase tracking-normal text-brand-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{value}</p>
      <p className="mt-2 text-[13px] leading-snug text-brand-text-muted">{detail}</p>
    </div>
  );
}

function ScorecardTrend({ trend }: { trend: ProviderDetail["scorecardTrend"] }) {
  const max = Math.max(...trend.map((row) => row.adjustedCost), 1);
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Cost Trend</h2>
          <p className="text-sm text-brand-text-muted">Case-mix-adjusted cost and claim volume by period.</p>
        </div>
        <TrendingUp className="h-5 w-5 text-brand-indigo" />
      </div>
      <div className="space-y-3 p-5">
        {trend.length === 0 && (
          <p className="py-8 text-center text-sm text-brand-text-muted">No scorecard history yet.</p>
        )}
        {trend.map((row) => (
          <div key={row.period} className="grid grid-cols-[64px_1fr_92px] items-center gap-3 text-[13px]">
            <span className="font-semibold text-brand-text-muted">{row.period}</span>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-[#E6E7E8]">
                <div
                  className="h-2 rounded-full bg-brand-indigo"
                  style={{ width: `${Math.max(3, (row.adjustedCost / max) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-brand-text-muted">
                {row.claimCount} claims · CMI {row.caseMixIndex.toFixed(2)} · {formatPercent(row.rejectionRate)} rejected
              </p>
            </div>
            <span className="text-right font-bold tabular-nums text-brand-text-heading">
              {formatMoney(row.adjustedCost)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeerComparison({ peers }: { peers: ProviderDetail["peers"] }) {
  const max = Math.max(...peers.map((p) => p.adjustedCost), 1);
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Peer Comparison</h2>
          <p className="text-sm text-brand-text-muted">Same tier, latest period. Ranked by adjusted cost.</p>
        </div>
        <Activity className="h-5 w-5 text-[#17A2B8]" />
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {peers.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No peer scorecard data yet.</p>
        )}
        {peers.map((peer, index) => (
          <div
            key={peer.providerId}
            className={`px-5 py-3 ${peer.isCurrent ? "bg-brand-indigo/5" : ""}`}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-[11px] font-bold text-brand-text-muted">#{index + 1}</span>
                <span className={`truncate text-[13px] font-semibold ${peer.isCurrent ? "text-brand-indigo" : "text-brand-text-heading"}`}>
                  {peer.providerName}{peer.isCurrent ? " ← this provider" : ""}
                </span>
              </div>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-brand-text-heading">
                {formatMoney(peer.adjustedCost)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#E6E7E8]">
              <div
                className={`h-1.5 rounded-full ${peer.isCurrent ? "bg-brand-indigo" : "bg-[#6C757D]/40"}`}
                style={{ width: `${Math.max(3, (peer.adjustedCost / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-brand-text-muted">
              {peer.claimCount} claims · CMI {peer.caseMixIndex.toFixed(2)} · {formatPercent(peer.rejectionRate)} rejected
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedPanel({
  title,
  subtitle,
  icon,
  rows,
  hrefFn,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: { label: string; meta: string; value: number; href?: string }[];
  hrefFn?: (label: string) => string | undefined;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">{title}</h2>
          <p className="text-sm text-brand-text-muted">{subtitle}</p>
        </div>
        {icon}
      </div>
      <div className="divide-y divide-[#EEEEEE]">
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No data yet.</p>
        )}
        {rows.map((row) => {
          const href = hrefFn?.(row.label) ?? row.href;
          return (
            <div key={row.label} className="px-5 py-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  {href ? (
                    <Link href={href} className="truncate block font-semibold text-brand-text-heading hover:text-brand-indigo hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold text-brand-text-heading">{row.label}</p>
                  )}
                  <p className="text-[13px] text-brand-text-muted">{row.meta}</p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-brand-text-heading">{formatMoney(row.value)}</p>
              </div>
              <div className="h-2 rounded-full bg-[#E6E7E8]">
                <div className="h-2 rounded-full bg-brand-indigo" style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function ProviderAnalyticsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ providerId: string }>;
  searchParams: Promise<{ from?: string; groupId?: string }>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const { providerId } = await params;
  const { from, groupId: fromGroupId } = await searchParams;
  const userRole = session.user.role;
  const canViewNamedClaims = userRole !== "REPORTS_VIEWER";
  const scope = await getAnalyticsAccessScope(session);

  const detail = await AnalyticsService.getProviderDetail({
    ...scope,
    providerId,
  });

  if (!detail) notFound();

  // Resolve back-navigation target: prefer the scheme we came from, fall back to analytics console
  const fromScheme = from === "scheme" && fromGroupId
    ? detail.schemeMix.find((s) => s.groupId === fromGroupId) ?? null
    : null;
  const backHref = fromScheme ? `/analytics/schemes/${fromGroupId}` : "/analytics";
  const backLabel = fromScheme ? `Back to ${fromScheme.groupName}` : "Back to analytics";

  const icdRows = detail.icdDrivers.map((row) => ({
    label: row.icdFamily,
    meta: `${row.encounterCount.toLocaleString()} encounters`,
    value: row.grossCost,
  }));

  const categoryRows = detail.categoryMix.map((row) => ({
    label: (row.benefitCategory ?? "Unknown").replace(/_/g, " "),
    meta: `${row.encounterCount.toLocaleString()} encounters`,
    value: row.grossCost,
  }));

  const schemeRows = detail.schemeMix.map((row) => ({
    label: row.groupName,
    meta: `${formatPercent(row.share)} of total cost · ${row.encounterCount.toLocaleString()} encounters`,
    value: row.grossCost,
    href: row.groupId ? `/analytics/schemes/${row.groupId}` : undefined,
  }));

  return (
    <div className="space-y-6 font-ui">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={backHref} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <h1 className="font-heading text-3xl font-bold text-brand-text-heading">{detail.provider.name}</h1>
          <p className="text-brand-text-muted">
            {detail.provider.type?.replace(/_/g, " ")} ·{" "}
            {detail.provider.county ?? "County not set"} ·{" "}
            Contract {detail.provider.contractStatus}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${tierTone(detail.provider.tier)}`}>
          {detail.provider.tier ?? "UNKNOWN"}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Adjusted Cost"
          value={detail.current ? formatMoney(detail.current.adjustedCost) : "—"}
          detail={`${detail.current?.period ?? "No period"} · ${detail.current?.claimCount.toLocaleString() ?? 0} claims`}
        />
        <MetricCard
          label="Average Claim"
          value={detail.current ? formatMoney(detail.current.averageCost) : "—"}
          detail={`${detail.current?.memberCount.toLocaleString() ?? 0} unique members`}
        />
        <MetricCard
          label="Case-Mix Index"
          value={detail.current ? detail.current.caseMixIndex.toFixed(2) : "—"}
          detail="1.0 = portfolio average complexity"
        />
        <MetricCard
          label="Rejection Rate"
          value={detail.current ? formatPercent(detail.current.rejectionRate) : "—"}
          detail={`Contract until ${formatDate(detail.provider.contractEndDate)}`}
        />
      </div>

      {/* Trend + Peer comparison */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ScorecardTrend trend={detail.scorecardTrend} />
        </div>
        <div className="space-y-4">
          <PeerComparison peers={detail.peers} />
          {/* Action links */}
          <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Actions</h2>
            <div className="mt-3 grid gap-2">
              <Link href={`/providers/${providerId}`} className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
                <Building className="h-4 w-4" />
                Open provider record
              </Link>
              <Link href={`/analytics/alerts?providerId=${providerId}`} className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
                <AlertTriangle className="h-4 w-4" />
                Provider alert inbox
              </Link>
              <Link href="/reports/provider-statements" className="flex items-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
                <FileText className="h-4 w-4" />
                Provider statements
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ICD, category, scheme mix */}
      <div className="grid gap-4 xl:grid-cols-3">
        <RankedPanel
          title="Disease Drivers"
          subtitle="Top ICD families by gross cost."
          icon={<Stethoscope className="h-5 w-5 text-[#DC3545]" />}
          rows={icdRows}
        />
        <RankedPanel
          title="Benefit Mix"
          subtitle="Cost by benefit category."
          icon={<Receipt className="h-5 w-5 text-[#17A2B8]" />}
          rows={categoryRows}
        />
        <RankedPanel
          title="Scheme Mix"
          subtitle="Groups sending volume to this provider."
          icon={<Building className="h-5 w-5 text-brand-indigo" />}
          rows={schemeRows}
        />
      </div>

      {/* Open alerts */}
      {detail.alerts.length > 0 && (
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-brand-text-heading">Open Alerts</h2>
              <p className="text-sm text-brand-text-muted">Active analytics signals for this provider.</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-[#FFC107]" />
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {detail.alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-4 px-5 py-4">
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${severityTone(alert.severity)}`}>
                  {alert.severity}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-brand-text-heading">{alert.title}</p>
                  <p className="text-[13px] leading-snug text-brand-text-muted">{alert.message}</p>
                </div>
                <Link
                  href={`/analytics/alerts?providerId=${providerId}`}
                  className="shrink-0 text-[13px] font-semibold text-brand-indigo hover:underline"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent claims — ops/clinical roles only */}
      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Recent Claims</h2>
            <p className="text-sm text-brand-text-muted">Latest 10 claims processed at this provider.</p>
          </div>
          <Receipt className="h-5 w-5 text-brand-indigo" />
        </div>
        {!canViewNamedClaims ? (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">
            Individual claim records are not available for your role. Use the Provider Statements report for aggregate data.
          </p>
        ) : detail.recentClaims.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No claims on record yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm font-ui">
              <thead className="border-b border-[#EEEEEE] bg-[#F8F9FA] text-[13px] uppercase tracking-normal text-brand-text-muted">
                <tr>
                  <th className="px-5 py-3 font-bold">Claim No.</th>
                  <th className="px-5 py-3 font-bold">Member</th>
                  <th className="px-5 py-3 font-bold">Category</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Billed</th>
                  <th className="px-5 py-3 font-bold">Approved</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {detail.recentClaims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-[#F8F9FA]">
                    <td className="px-5 py-3">
                      <Link href={`/claims/${claim.id}`} className="font-semibold text-brand-indigo hover:underline">
                        {claim.claimNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-brand-text-heading">{claim.memberName}</td>
                    <td className="px-5 py-3 text-brand-text-muted">{(claim.benefitCategory ?? "").replace(/_/g, " ") || "—"}</td>
                    <td className="px-5 py-3 tabular-nums text-brand-text-muted">{formatDate(claim.dateOfService)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatMoney(claim.billedAmount)}</td>
                    <td className="px-5 py-3 tabular-nums">{claim.approvedAmount > 0 ? formatMoney(claim.approvedAmount) : "—"}</td>
                    <td className={`px-5 py-3 text-[13px] font-semibold ${statusTone(claim.status)}`}>
                      {claim.status.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
