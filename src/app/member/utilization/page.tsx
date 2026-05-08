import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import { ArrowRight, EyeOff, HeartPulse, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

type SearchParams = {
  memberId?: string;
  period?: "30d" | "90d" | "ytd" | "all";
  status?: string;
  benefitCategory?: string;
};

function formatMoney(value: number | null) {
  if (value === null) return "Private";
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  return `KES ${Math.round(value).toLocaleString("en-KE")}`;
}

function formatDateTime(value: Date) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("APPROVED") || normalized.includes("PAID")) return "bg-[#28A745]/10 text-[#28A745]";
  if (normalized.includes("REVIEW") || normalized.includes("RECEIVED") || normalized.includes("CAPTURED")) return "bg-[#17A2B8]/10 text-[#17A2B8]";
  if (normalized.includes("PARTIAL")) return "bg-[#FFC107]/15 text-[#856404]";
  if (normalized.includes("DECLINED") || normalized.includes("VOID")) return "bg-[#DC3545]/10 text-[#DC3545]";
  return "bg-[#6C757D]/10 text-[#6C757D]";
}

function queryLink(current: SearchParams, changes: Partial<SearchParams>) {
  const params = new URLSearchParams();
  const next = { ...current, ...changes };
  for (const [key, value] of Object.entries(next)) {
    if (value && value !== "all") params.set(key, value);
  }
  const query = params.toString();
  return query ? `/member/utilization?${query}` : "/member/utilization";
}

export default async function MemberUtilizationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const params = await searchParams;
  const history = await MemberAppService.getEncounterHistoryForUser(session.user.id, session.user.tenantId, {
    memberId: params.memberId,
    period: params.period ?? "all",
    status: params.status === "all" ? undefined : params.status,
    benefitCategory: params.benefitCategory === "all" ? undefined : params.benefitCategory,
  });

  if (!history) redirect("/login");

  const currentFilters: SearchParams = {
    memberId: history.filters.memberId,
    period: history.filters.period,
    status: history.filters.status,
    benefitCategory: history.filters.benefitCategory,
  };

  const periods = [
    { label: "All", value: "all" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
    { label: "YTD", value: "ytd" },
  ] as const;

  const statuses = ["all", "RECEIVED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED", "PAID", "DECLINED"];
  const categories = ["all", "OUTPATIENT", "INPATIENT", "DENTAL", "OPTICAL", "MATERNITY", "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL"];

  return (
    <div className="space-y-6 font-ui">
      <div>
        <h1 className="font-heading text-2xl font-bold text-avenue-text-heading">Care History</h1>
        <p className="mt-1 text-avenue-text-muted">Visits, approvals, payments, and your share of care costs.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Provider bills", value: formatMoney(history.summary.totalBilled), icon: ReceiptText, tone: "text-avenue-indigo" },
          { label: "Plan approved", value: formatMoney(history.summary.planApproved), icon: ShieldCheck, tone: "text-[#28A745]" },
          { label: "Plan paid", value: formatMoney(history.summary.planPaid), icon: HeartPulse, tone: "text-[#17A2B8]" },
          { label: "Your share", value: formatMoney(history.summary.memberShare), icon: WalletCards, tone: "text-[#856404]" },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
              <Icon className={`h-5 w-5 ${metric.tone}`} />
              <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">{metric.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${metric.tone}`}>{metric.value}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <div>
            <p className="mb-2 text-[13px] font-bold uppercase text-avenue-text-muted">Period</p>
            <div className="flex flex-wrap gap-2">
              {periods.map((period) => (
                <Link
                  key={period.value}
                  href={queryLink(currentFilters, { period: period.value })}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${history.filters.period === period.value ? "bg-avenue-indigo text-white" : "bg-[#F8F9FA] text-avenue-text-heading hover:text-avenue-indigo"}`}
                >
                  {period.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-bold uppercase text-avenue-text-muted">Member</p>
            <div className="flex flex-wrap gap-2">
              <Link href={queryLink(currentFilters, { memberId: "all" })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${history.filters.memberId === "all" ? "bg-avenue-indigo text-white" : "bg-[#F8F9FA] text-avenue-text-heading hover:text-avenue-indigo"}`}>
                All
              </Link>
              {history.familyOptions.map((member) => (
                <Link
                  key={member.id}
                  href={queryLink(currentFilters, { memberId: member.id })}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${history.filters.memberId === member.id ? "bg-avenue-indigo text-white" : "bg-[#F8F9FA] text-avenue-text-heading hover:text-avenue-indigo"}`}
                >
                  {member.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-bold uppercase text-avenue-text-muted">Status</p>
            <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
              {statuses.map((status) => (
                <Link
                  key={status}
                  href={queryLink(currentFilters, { status })}
                  className={`rounded-full px-2 py-1 text-[12px] font-semibold ${history.filters.status === status ? "bg-avenue-indigo text-white" : "bg-[#F8F9FA] text-avenue-text-heading hover:text-avenue-indigo"}`}
                >
                  {status === "all" ? "All" : status.replace(/_/g, " ")}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-bold uppercase text-avenue-text-muted">Benefit</p>
            <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
              {categories.map((category) => (
                <Link
                  key={category}
                  href={queryLink(currentFilters, { benefitCategory: category })}
                  className={`rounded-full px-2 py-1 text-[12px] font-semibold ${history.filters.benefitCategory === category ? "bg-avenue-indigo text-white" : "bg-[#F8F9FA] text-avenue-text-heading hover:text-avenue-indigo"}`}
                >
                  {category === "all" ? "All" : category.replace(/_/g, " ")}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {history.summary.privateEncounterCount > 0 && (
        <div className="flex items-start gap-3 rounded-[8px] border border-[#EEEEEE] bg-white p-4 text-sm text-avenue-text-muted shadow-sm">
          <EyeOff className="mt-0.5 h-5 w-5 text-avenue-indigo" />
          <p>
            {history.summary.privateEncounterCount} family care event(s) are included in counts but hidden in detail because they are in sensitive categories.
          </p>
        </div>
      )}

      <section className="space-y-3">
          {history.encounters.map((encounter) => {
            const content = (
              <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-[0_8px_22px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#F8F9FA]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold uppercase leading-snug text-avenue-text-heading">
                      {formatDateTime(encounter.dateOfService)} | {encounter.providerName}
                    </p>
                    <p className="mt-2 text-[13px] text-avenue-text-muted">
                      {encounter.memberName} · {encounter.serviceType.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(encounter.status)}`}>
                      {encounter.status}
                    </span>
                    {encounter.href && <ArrowRight className="h-5 w-5 text-avenue-indigo" />}
                  </div>
                </div>

                {encounter.masked && (
                  <span className="mt-3 inline-flex rounded-full bg-[#6C757D]/10 px-2 py-0.5 text-[12px] font-bold text-[#6C757D]">Private</span>
                )}

                <div className="mt-5 grid grid-cols-[1fr_auto] gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] text-avenue-text-muted">Benefit</p>
                    <p className="mt-1 text-base font-semibold leading-snug text-avenue-text-heading">
                      {encounter.masked ? "Private family event" : encounter.benefitCategory.replace(/_/g, " ")}
                    </p>
                    <p className="mt-2 font-mono text-[12px] text-avenue-text-muted">{encounter.claimNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-avenue-text-muted">Expenditure</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-avenue-text-heading">{formatMoney(encounter.billedAmount)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EEEEEE] pt-3 text-sm">
                  <div>
                    <p className="text-[13px] text-avenue-text-muted">Plan approved</p>
                    <p className="font-bold tabular-nums text-[#1F7A34]">{formatMoney(encounter.planApprovedAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-avenue-text-muted">Your share</p>
                    <p className="font-bold tabular-nums text-[#856404]">{formatMoney(encounter.memberShare)}</p>
                  </div>
                </div>
              </div>
            );

            return encounter.href ? (
              <Link key={encounter.id} href={encounter.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={encounter.id}>{content}</div>
            );
          })}

          {history.encounters.length === 0 && (
            <div className="rounded-[8px] border border-[#EEEEEE] bg-white px-5 py-12 text-center text-sm text-avenue-text-muted shadow-sm">No care events match these filters.</div>
          )}
      </section>
    </div>
  );
}
