import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import { Activity, CalendarClock, CheckCircle2, Shield, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";

function formatMoney(value: number | null) {
  if (value === null) return "Private";
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  return `KES ${Math.round(value).toLocaleString("en-KE")}`;
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function barTone(pct: number) {
  if (pct >= 0.9) return "bg-[#DC3545]";
  if (pct >= 0.7) return "bg-[#FFC107]";
  return "bg-[#28A745]";
}

function paceTone(pace: string) {
  if (pace === "Cap reached" || pace === "Near cap") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (pace === "Ahead of expected use") return "bg-[#FFC107]/15 text-[#856404]";
  return "bg-[#28A745]/10 text-[#28A745]";
}

export default async function MemberBenefitsPage() {
  const session = await requireRole(ROLES.MEMBER);
  const state = await MemberAppService.getBenefitStateForUser(session.user.id, session.user.tenantId);

  if (!state) redirect("/login");

  const usedPct = Math.round(state.summary.overallUsedPct * 100);
  const elapsedPct = Math.round(state.summary.elapsedPct * 100);

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-avenue-text-heading">My Benefits</h1>
          <p className="mt-1 text-avenue-text-muted">
            {state.package.name} · Membership year {formatDate(state.period.periodStart)} to {formatDate(state.period.periodEnd)}
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-[13px] font-bold ${paceTone(state.summary.pace)}`}>
          {state.summary.pace}
        </span>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold uppercase text-avenue-text-muted">Remaining balance</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-avenue-text-heading">{formatMoney(state.summary.totalRemaining)}</p>
              <p className="mt-1 text-sm text-avenue-text-muted">
                Used {formatMoney(state.summary.totalUsed)} of {formatMoney(state.summary.totalLimit)}
              </p>
            </div>
            <Shield className="h-8 w-8 text-avenue-indigo" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
            <div className={`h-full rounded-full ${barTone(state.summary.overallUsedPct)}`} style={{ width: `${usedPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[13px] text-avenue-text-muted">
            <span>{usedPct}% of benefits used</span>
            <span>{elapsedPct}% of year elapsed</span>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CalendarClock className="h-6 w-6 text-[#17A2B8]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">How to read this</p>
          <p className="mt-2 text-sm leading-relaxed text-avenue-text-muted">
            The pace compares your benefit use with how far you are through the membership year. It is a guide, not a restriction.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {state.benefitStates.map((benefit) => {
          const pct = Math.round(benefit.usedPct * 100);
          return (
            <div key={benefit.id} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-lg font-bold text-avenue-text-heading">{benefit.name}</h2>
                    <span className={`rounded-full px-2 py-1 text-[12px] font-bold ${paceTone(benefit.pace)}`}>
                      {benefit.pace}
                    </span>
                  </div>
                  {benefit.notes && <p className="mt-1 text-sm text-avenue-text-muted">{benefit.notes}</p>}
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-bold tabular-nums text-avenue-indigo">{formatMoney(benefit.limit)}</p>
                  <p className="text-[13px] text-avenue-text-muted">annual limit</p>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
                <div className={`h-full rounded-full transition-all ${barTone(benefit.usedPct)}`} style={{ width: `${pct}%` }} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[13px] text-avenue-text-muted">Used</p>
                  <p className="font-bold tabular-nums text-avenue-text-heading">{formatMoney(benefit.used)}</p>
                </div>
                <div>
                  <p className="text-[13px] text-avenue-text-muted">Remaining</p>
                  <p className="font-bold tabular-nums text-[#28A745]">{formatMoney(benefit.remaining)}</p>
                </div>
                <div>
                  <p className="text-[13px] text-avenue-text-muted">Care events</p>
                  <p className="font-bold tabular-nums text-avenue-text-heading">{benefit.claimCount.toLocaleString("en-KE")}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[13px] text-avenue-text-muted">
                {benefit.perVisitLimit !== null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F9FA] px-2 py-1">
                    <Activity className="h-3.5 w-3.5" /> {formatMoney(benefit.perVisitLimit)} per visit
                  </span>
                )}
                {benefit.copayPercentage > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F9FA] px-2 py-1">
                    <TrendingUp className="h-3.5 w-3.5" /> {benefit.copayPercentage}% member share
                  </span>
                )}
                {benefit.waitingPeriodDays > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F9FA] px-2 py-1">
                    <CalendarClock className="h-3.5 w-3.5" /> {benefit.waitingPeriodDays} day waiting period
                  </span>
                )}
                {benefit.exclusions.length === 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#28A745]/10 px-2 py-1 text-[#28A745]">
                    <CheckCircle2 className="h-3.5 w-3.5" /> No listed exclusions
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {state.benefitStates.length === 0 && (
          <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-8 text-center text-avenue-text-body shadow-sm">
            No benefit schedule configured. Please contact support.
          </div>
        )}
      </section>
    </div>
  );
}
