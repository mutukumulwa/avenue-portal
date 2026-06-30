import Link from "next/link";
import { AnalyticsAlertSeverity, AnalyticsAlertStatus, AnalyticsAlertType } from "@prisma/client";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDot, Filter, Stethoscope, Users } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";
import { acknowledgeAnalyticsAlertAction, resolveAnalyticsAlertAction } from "./actions";

type SearchParams = {
  status?: string;
  severity?: string;
  type?: string;
  groupId?: string;
};

type AlertsData = Awaited<ReturnType<typeof AnalyticsService.getAlerts>>;

function enumValue<T extends Record<string, string>>(source: T, value?: string) {
  return value && Object.values(source).includes(value) ? value as T[keyof T] : undefined;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMetric(value: number, metricKey?: string | null) {
  if (!metricKey) return value.toLocaleString();
  if (metricKey.toLowerCase().includes("mlr") || metricKey.toLowerCase().includes("rate") || Math.abs(value) <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

function severityTone(severity: AnalyticsAlertSeverity) {
  if (severity === "CRITICAL") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (severity === "WARNING") return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#17A2B8]/10 text-[#17A2B8]";
}

function statusTone(status: AnalyticsAlertStatus) {
  if (status === "RESOLVED") return "bg-[#28A745]/10 text-[#28A745]";
  if (status === "ACKNOWLEDGED") return "bg-brand-indigo/10 text-brand-indigo";
  return "bg-[#DC3545]/10 text-[#DC3545]";
}

function filterHref(params: SearchParams, updates: SearchParams) {
  const next = new URLSearchParams();
  const merged = { ...params, ...updates };
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/analytics/alerts?${query}` : "/analytics/alerts";
}

function WorkloadCards({ data }: { data: AlertsData }) {
  const cards = [
    { label: "Open", value: data.statusCounts.OPEN ?? 0, tone: "text-[#DC3545] bg-[#DC3545]/10" },
    { label: "Acknowledged", value: data.statusCounts.ACKNOWLEDGED ?? 0, tone: "text-brand-indigo bg-brand-indigo/10" },
    { label: "Resolved", value: data.statusCounts.RESOLVED ?? 0, tone: "text-[#28A745] bg-[#28A745]/10" },
    { label: "Critical Active", value: data.severityCounts.CRITICAL ?? 0, tone: "text-[#DC3545] bg-[#DC3545]/10" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-normal text-brand-text-muted">{card.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{card.value.toLocaleString()}</p>
            </div>
            <span className={`rounded-[8px] p-2 ${card.tone}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Filters({ params }: { params: SearchParams }) {
  const statusTabs: { label: string; status?: AnalyticsAlertStatus }[] = [
    { label: "Active" },
    { label: "Open", status: "OPEN" },
    { label: "Acknowledged", status: "ACKNOWLEDGED" },
    { label: "Resolved", status: "RESOLVED" },
  ];

  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-text-heading">
        <Filter className="h-4 w-4 text-brand-indigo" />
        Filter queue
      </div>
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const active = tab.status ? params.status === tab.status : !params.status;
          return (
            <Link
              key={tab.label}
              href={filterHref(params, { status: tab.status })}
              className={`rounded-full px-3 py-1 text-[13px] font-bold ${active ? "bg-brand-indigo text-white" : "bg-brand-bg-alt text-brand-text-heading hover:text-brand-indigo"}`}
            >
              {tab.label}
            </Link>
          );
        })}
        {Object.values(AnalyticsAlertSeverity).map((severity) => (
          <Link
            key={severity}
            href={filterHref(params, { severity: params.severity === severity ? undefined : severity })}
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${params.severity === severity ? severityTone(severity) : "bg-brand-bg-alt text-brand-text-heading hover:text-brand-indigo"}`}
          >
            {severity}
          </Link>
        ))}
      </div>
    </div>
  );
}

function AlertActions({ alert }: { alert: AlertsData["alerts"][number] }) {
  if (alert.status === "RESOLVED") {
    return (
      <div className="rounded-[8px] bg-[#28A745]/10 px-3 py-2 text-sm font-semibold text-[#28A745]">
        Resolved {alert.resolvedAt ? formatDate(alert.resolvedAt) : ""}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {alert.status === "OPEN" && (
        <form action={acknowledgeAnalyticsAlertAction}>
          <input type="hidden" name="alertId" value={alert.id} />
          {alert.groupId && <input type="hidden" name="groupId" value={alert.groupId} />}
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#EEEEEE] px-3 py-2 text-sm font-semibold text-brand-text-heading hover:border-brand-indigo hover:text-brand-indigo">
            <CircleDot className="h-4 w-4" />
            Acknowledge
          </button>
        </form>
      )}
      <form action={resolveAnalyticsAlertAction} className="grid gap-2">
        <input type="hidden" name="alertId" value={alert.id} />
        {alert.groupId && <input type="hidden" name="groupId" value={alert.groupId} />}
        <input
          name="resolutionNote"
          className="h-9 rounded-[8px] border border-[#EEEEEE] px-3 text-sm outline-none focus:border-brand-indigo"
          placeholder="Resolution note"
        />
        <button className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-brand-indigo/90">
          <CheckCircle2 className="h-4 w-4" />
          Resolve
        </button>
      </form>
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertsData["alerts"][number] }) {
  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[13px] font-bold ${severityTone(alert.severity)}`}>{alert.severity}</span>
          <span className={`rounded-full px-2 py-1 text-[13px] font-bold ${statusTone(alert.status)}`}>{alert.status.replace(/_/g, " ")}</span>
          <span className="rounded-full bg-brand-bg-alt px-2 py-1 text-[13px] font-bold text-brand-text-heading">{alert.type.replace(/_/g, " ")}</span>
        </div>
        <h2 className="font-heading text-lg font-bold text-brand-text-heading">{alert.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-brand-text-muted">{alert.message}</p>

        <div className="mt-4 grid gap-3 text-[13px] md:grid-cols-3">
          <div>
            <p className="font-bold uppercase tracking-normal text-brand-text-muted">Metric</p>
            <p className="mt-1 font-semibold tabular-nums text-brand-text-heading">
              {alert.metricKey ?? "Signal"}: {formatMetric(alert.metricValue, alert.metricKey)}
            </p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-normal text-brand-text-muted">Threshold</p>
            <p className="mt-1 font-semibold tabular-nums text-brand-text-heading">
              {alert.thresholdValue ? formatMetric(alert.thresholdValue, alert.metricKey) : "Not set"}
            </p>
          </div>
          <div>
            <p className="font-bold uppercase tracking-normal text-brand-text-muted">Raised</p>
            <p className="mt-1 font-semibold text-brand-text-heading">{formatDate(alert.createdAt)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          {alert.groupId && (
            <Link href={`/analytics/schemes/${alert.groupId}`} className="inline-flex items-center gap-1 rounded-full bg-brand-indigo/10 px-2 py-1 font-semibold text-brand-indigo hover:underline">
              <Users className="h-3.5 w-3.5" />
              {alert.groupName ?? "Scheme"}
            </Link>
          )}
          {alert.providerId && (
            <Link href={`/providers/${alert.providerId}`} className="inline-flex items-center gap-1 rounded-full bg-[#17A2B8]/10 px-2 py-1 font-semibold text-[#17A2B8] hover:underline">
              <Stethoscope className="h-3.5 w-3.5" />
              {alert.providerName ?? "Provider"}
            </Link>
          )}
          {alert.memberId && (
            <Link href={`/members/${alert.memberId}`} className="rounded-full bg-brand-bg-alt px-2 py-1 font-semibold text-brand-text-heading hover:text-brand-indigo">
              {alert.memberNumber ?? alert.memberName ?? "Member"}
            </Link>
          )}
          {alert.intermediaryName && (
            <span className="rounded-full bg-brand-bg-alt px-2 py-1 font-semibold text-brand-text-heading">
              {alert.intermediaryName}
            </span>
          )}
        </div>

        {alert.resolutionNote && (
          <p className="mt-4 rounded-[8px] bg-[#F8F9FA] px-3 py-2 text-sm text-brand-text-muted">{alert.resolutionNote}</p>
        )}
      </div>
      <AlertActions alert={alert} />
    </div>
  );
}

export default async function AnalyticsAlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const scope = await getAnalyticsAccessScope(session);
  const params = await searchParams;
  const status = enumValue(AnalyticsAlertStatus, params.status);
  const severity = enumValue(AnalyticsAlertSeverity, params.severity);
  const type = enumValue(AnalyticsAlertType, params.type);
  const data = await AnalyticsService.getAlerts(
    scope,
    {
      status,
      severity,
      type,
      groupId: params.groupId,
      includeResolved: status === "RESOLVED",
      limit: 100,
    },
  );

  return (
    <div className="space-y-6 font-ui">
      <div>
        <Link href="/analytics" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to analytics
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-indigo">
            <AlertTriangle className="h-4 w-4" />
            Strategic Purchasing
          </div>
          <h1 className="font-heading text-3xl font-bold text-brand-text-heading">Analytics Alert Inbox</h1>
          <p className="text-brand-text-muted">Operational queue for MLR drift, provider anomalies, renewal risk, and contribution signals.</p>
        </div>
      </div>

      <WorkloadCards data={data} />
      <Filters params={params} />

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Alert Stream</h2>
            <p className="text-sm text-brand-text-muted">{data.alerts.length.toLocaleString()} alerts match the current filter.</p>
          </div>
          {params.groupId && (
            <Link href="/analytics/alerts" className="text-sm font-semibold text-brand-indigo hover:underline">
              Clear scheme filter
            </Link>
          )}
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {data.alerts.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-brand-text-muted">No analytics alerts match this queue filter.</p>
          )}
          {data.alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      </div>
    </div>
  );
}
