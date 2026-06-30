import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  CreditCard,
  HeartPulse,
  History,
  Phone,
  QrCode,
  Shield,
  Stethoscope,
  Users,
} from "lucide-react";
import Link from "next/link";

function formatMoney(value: number) {
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

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("APPROVED") || normalized.includes("PAID") || normalized.includes("COLLECTED") || normalized.includes("CONVERTED")) {
    return "bg-[#28A745]/10 text-[#28A745]";
  }
  if (normalized.includes("REVIEW") || normalized.includes("SUBMITTED") || normalized.includes("PENDING") || normalized.includes("PARTIAL")) {
    return "bg-[#17A2B8]/10 text-[#17A2B8]";
  }
  if (normalized.includes("DECLINED") || normalized.includes("FAILED") || normalized.includes("VOID")) {
    return "bg-[#DC3545]/10 text-[#DC3545]";
  }
  return "bg-[#6C757D]/10 text-[#6C757D]";
}

function pressureTone(pace: string) {
  if (pace === "Cap reached" || pace === "Near cap") return "bg-[#DC3545]";
  if (pace === "Ahead of expected use") return "bg-[#FFC107]";
  return "bg-[#28A745]";
}

export default async function MemberDashboardPage() {
  const session = await requireRole(ROLES.MEMBER);
  const dashboard = await MemberAppService.getDashboardForUser(session.user.id, session.user.tenantId);

  if (!dashboard) {
    return (
      <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-8 text-center text-avenue-text-body shadow-sm">
        No member profile linked to your account. Please contact support.
      </div>
    );
  }

  const memberName = `${dashboard.member.firstName} ${dashboard.member.lastName}`;
  const usedPercent = Math.round(dashboard.summary.overallUsedPct * 100);
  const quickActions = [
    { label: "Find care", href: "/member/facilities", icon: Building2 },
    { label: "Request pre-auth", href: "/member/preauth", icon: Stethoscope },
    { label: "Check in", href: "/member/check-in", icon: QrCode },
    { label: "Family", href: "/member/dependents", icon: Users },
  ];

  return (
    <div className="space-y-5 font-ui">
      {dashboard.member.status === "LAPSED" && (
        <div className="rounded-[8px] border border-[#DC3545]/30 bg-[#DC3545]/10 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#DC3545] text-sm">Your membership is lapsed</p>
            <p className="text-sm text-avenue-text-body mt-0.5">Benefits are suspended. Request reinstatement to resume cover.</p>
          </div>
          <a
            href="/member/reinstatement"
            className="shrink-0 rounded-full bg-[#DC3545] px-4 py-2 text-xs font-bold text-white hover:bg-[#b02a37] transition-colors"
          >
            Request Reinstatement
          </a>
        </div>
      )}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[8px] bg-avenue-indigo p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase opacity-80">Medvex Member</p>
              <h1 className="mt-1 truncate font-heading text-2xl font-bold">{memberName}</h1>
              <p className="mt-1 text-sm opacity-85">{dashboard.group.name}</p>
              <p className="mt-3 font-mono text-[13px] opacity-80">{dashboard.member.memberNumber}</p>
            </div>
            <div className="rounded-[8px] bg-white/15 p-2">
              <QrCode className="h-12 w-12 opacity-90" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4 text-sm">
            <div>
              <p className="text-[13px] opacity-70">Package</p>
              <p className="mt-0.5 font-semibold">{dashboard.package.name}</p>
            </div>
            <div>
              <p className="text-[13px] opacity-70">Renewal</p>
              <p className="mt-0.5 font-semibold">{formatDate(dashboard.group.renewalDate)}</p>
            </div>
            <div>
              <p className="text-[13px] opacity-70">Status</p>
              <p className="mt-0.5 font-semibold">{dashboard.member.status.replace(/_/g, " ")}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold uppercase text-avenue-text-muted">Annual cover balance</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-avenue-text-heading">
                {formatMoney(dashboard.summary.totalRemaining)}
              </p>
              <p className="mt-1 text-sm text-avenue-text-muted">
                Remaining of {formatMoney(dashboard.summary.totalLimit)} annual cover this membership year
              </p>
            </div>
            <Shield className="h-8 w-8 text-avenue-indigo" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
            <div
              className={`h-full rounded-full ${usedPercent >= 90 ? "bg-[#DC3545]" : usedPercent >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]"}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[13px] text-avenue-text-muted">
            <span>{formatMoney(dashboard.summary.totalUsed)} used against annual cover</span>
            <span>{usedPercent}% used</span>
          </div>
        </div>
      </section>

      {dashboard.summary.outstandingMemberShare > 0 && (
        <section className="rounded-[8px] border border-[#FFC107]/40 bg-[#FFC107]/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-5 w-5 text-[#856404]" />
              <div>
                <p className="font-bold text-avenue-text-heading">Member share pending</p>
                <p className="text-sm text-avenue-text-muted">
                  {formatMoney(dashboard.summary.outstandingMemberShare)} is awaiting collection or payment confirmation.
                </p>
              </div>
            </div>
            <Link href="/member/utilization" className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-white px-3 py-2 text-sm font-semibold text-avenue-indigo shadow-sm hover:underline">
              Review costs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {dashboard.notifications.length > 0 && (
        <section className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Notifications</h2>
              <p className="text-sm text-avenue-text-muted">Recent approvals, payments, and member updates.</p>
            </div>
            <Link href="/member/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-avenue-indigo hover:underline">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {dashboard.notifications.slice(0, 3).map((notification) => (
              <Link
                key={notification.id}
                href={notification.href ?? "/member/notifications"}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 hover:bg-[#F8F9FA]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-avenue-indigo/10 text-avenue-indigo">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-avenue-text-heading">{notification.title}</p>
                  <p className="truncate text-[13px] text-avenue-text-muted">{notification.body}</p>
                </div>
                {notification.readAt === null && (
                  <span className="rounded-full bg-[#28A745]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#1F7A34]">
                    New
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm transition-colors hover:border-avenue-indigo/40 hover:text-avenue-indigo">
              <Icon className="h-5 w-5" />
              <p className="mt-3 text-sm font-bold">{action.label}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Benefit pressure</h2>
              <p className="text-sm text-avenue-text-muted">Category sublimits can sit inside the annual cover.</p>
            </div>
            <Link href="/member/benefits" className="text-sm font-semibold text-avenue-indigo hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {dashboard.pressureBenefits.map((benefit) => (
              <div key={benefit.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-avenue-text-heading">{benefit.name}</span>
                  <span className="tabular-nums text-avenue-text-muted">{Math.round(benefit.usedPct * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#E6E7E8]">
                  <div className={`h-full rounded-full ${pressureTone(benefit.pace)}`} style={{ width: `${Math.round(benefit.usedPct * 100)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[13px] text-avenue-text-muted">
                  <span>{benefit.pace}</span>
                  <span>{formatMoney(benefit.remaining)} left</span>
                </div>
              </div>
            ))}
            {dashboard.pressureBenefits.length === 0 && (
              <p className="py-8 text-center text-sm text-avenue-text-muted">Your benefit schedule is not configured yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] px-5 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Recent activity</h2>
              <p className="text-sm text-avenue-text-muted">Care visits, pre-authorizations, and member-share updates.</p>
            </div>
            <History className="h-5 w-5 text-avenue-indigo" />
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {dashboard.recentActivity.map((activity) => (
              <Link key={activity.id} href={activity.href} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 hover:bg-[#F8F9FA]">
                <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-avenue-indigo/10 text-avenue-indigo">
                  {activity.type === "PREAUTH" ? <Stethoscope className="h-4 w-4" /> : activity.type === "MEMBER_SHARE" ? <CreditCard className="h-4 w-4" /> : <HeartPulse className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-avenue-text-heading">{activity.title}</p>
                  <p className="truncate text-[13px] text-avenue-text-muted">{activity.description} · {formatDate(activity.date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-avenue-text-heading">{formatMoney(activity.amount)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[12px] font-bold ${statusTone(activity.status)}`}>
                    {activity.status}
                  </span>
                </div>
              </Link>
            ))}
            {dashboard.recentActivity.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-avenue-text-muted">No activity has been recorded yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <Users className="h-5 w-5 text-avenue-indigo" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Family covered</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-avenue-text-heading">
            {dashboard.summary.activeDependentCount + 1}
          </p>
          <p className="mt-1 text-sm text-avenue-text-muted">Including you and active dependants.</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CalendarClock className="h-5 w-5 text-[#17A2B8]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Membership year</p>
          <p className="mt-1 text-lg font-bold text-avenue-text-heading">{formatDate(dashboard.period.periodStart)}</p>
          <p className="mt-1 text-sm text-avenue-text-muted">Runs until {formatDate(dashboard.period.periodEnd)}.</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <BadgeCheck className="h-5 w-5 text-[#28A745]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Next best action</p>
          <p className="mt-1 text-lg font-bold text-avenue-text-heading">Keep your digital card ready</p>
          <p className="mt-1 text-sm text-avenue-text-muted">Use check-in when you arrive at an Medvex or partner facility.</p>
        </div>
      </section>

      <a
        href="https://wa.me/254700000000"
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-[#25D366] p-4 text-white shadow-lg transition-transform hover:scale-105"
      >
        <Phone className="h-5 w-5" />
        <span className="hidden text-sm font-semibold sm:inline">WhatsApp Us</span>
      </a>
    </div>
  );
}
