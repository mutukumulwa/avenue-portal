import Link from "next/link";
import { AlertTriangle, Fingerprint, ShieldAlert, ShieldCheck } from "lucide-react";
import { CheckInFlow, CheckInOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date: Date) {
  const end = startOfDay(date);
  end.setDate(end.getDate() + 1);
  return end;
}

function pct(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function CheckInAuditPage(props: {
  searchParams: Promise<{ flow?: string; outcome?: string; review?: string; date?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { flow, outcome, review, date } = await props.searchParams;

  const selectedDate = date ? new Date(`${date}T00:00:00`) : new Date();
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);
  const reviewOnly = review !== "false";

  const where = {
    tenantId: session.user.tenantId,
    createdAt: { gte: dayStart, lt: dayEnd },
    ...(flow ? { flow: flow as CheckInFlow } : {}),
    ...(outcome ? { outcome: outcome as CheckInOutcome } : {}),
    ...(reviewOnly ? { reviewRequired: true } : {}),
  };

  const [events, totalEvents, biometricSuccess, fallbackEvents, overrideEvents, reviewEvents] = await Promise.all([
    prisma.checkInEvent.findMany({
      where,
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        initiatedBy: { select: { firstName: true, lastName: true, email: true } },
        overrideBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.checkInEvent.count({
      where: { tenantId: session.user.tenantId, createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.checkInEvent.count({
      where: {
        tenantId: session.user.tenantId,
        createdAt: { gte: dayStart, lt: dayEnd },
        flow: CheckInFlow.BIOMETRIC,
        outcome: CheckInOutcome.SUCCESS,
      },
    }),
    prisma.checkInEvent.count({
      where: {
        tenantId: session.user.tenantId,
        createdAt: { gte: dayStart, lt: dayEnd },
        flow: { in: [CheckInFlow.IN_APP_CONFIRMATION, CheckInFlow.SMS_OTP, CheckInFlow.PHOTO_KNOWLEDGE] },
      },
    }),
    prisma.checkInEvent.count({
      where: {
        tenantId: session.user.tenantId,
        createdAt: { gte: dayStart, lt: dayEnd },
        flow: CheckInFlow.EMERGENCY_OVERRIDE,
      },
    }),
    prisma.checkInEvent.count({
      where: {
        tenantId: session.user.tenantId,
        createdAt: { gte: dayStart, lt: dayEnd },
        reviewRequired: true,
      },
    }),
  ]);

  const overridesByUser = new Map<string, { label: string; count: number }>();
  const overridesByFacility = new Map<string, { label: string; count: number }>();

  for (const event of events.filter((item) => item.flow === CheckInFlow.EMERGENCY_OVERRIDE)) {
    const userLabel = event.overrideBy
      ? `${event.overrideBy.firstName} ${event.overrideBy.lastName}`
      : "Unknown user";
    const userKey = event.overrideBy?.email ?? userLabel;
    overridesByUser.set(userKey, {
      label: userLabel,
      count: (overridesByUser.get(userKey)?.count ?? 0) + 1,
    });

    const facilityLabel = event.provider?.name ?? "Unknown facility";
    overridesByFacility.set(facilityLabel, {
      label: facilityLabel,
      count: (overridesByFacility.get(facilityLabel)?.count ?? 0) + 1,
    });
  }

  const queryDate = dayStart.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Check-In Audit</h1>
          <p className="text-sm text-avenue-text-body mt-0.5">
            Same-day review of biometric failures, fallback paths, and emergency overrides.
          </p>
        </div>
        <Link href="/fraud" className="rounded-full border border-[#EEEEEE] px-4 py-2 text-sm font-semibold text-avenue-text-body hover:bg-avenue-bg-alt">
          Claim fraud desk
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Events", value: totalEvents, icon: Fingerprint, color: "text-avenue-indigo" },
          { label: "Biometric Success", value: biometricSuccess, icon: ShieldCheck, color: "text-[#28A745]" },
          { label: "Fallback Events", value: fallbackEvents, icon: AlertTriangle, color: "text-[#856404]" },
          { label: "Overrides", value: overrideEvents, icon: ShieldAlert, color: "text-avenue-error" },
          { label: "Needs Review", value: reviewEvents, icon: AlertTriangle, color: "text-avenue-error" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-[#EEEEEE] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase text-avenue-text-muted">{card.label}</p>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-[#EEEEEE] bg-white p-4">
        <form className="grid gap-3 md:grid-cols-5">
          <label className="block">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Date</span>
            <input name="date" type="date" defaultValue={queryDate} className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Flow</span>
            <select name="flow" defaultValue={flow ?? ""} className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">All flows</option>
              {Object.values(CheckInFlow).map((value) => (
                <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Outcome</span>
            <select name="outcome" defaultValue={outcome ?? ""} className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">All outcomes</option>
              {Object.values(CheckInOutcome).map((value) => (
                <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-avenue-text-muted">Review</span>
            <select name="review" defaultValue={review ?? "true"} className="mt-1 w-full rounded-md border border-[#EEEEEE] px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="true">Needs review</option>
              <option value="false">All events</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-full bg-avenue-indigo px-4 py-2 text-sm font-bold text-white hover:bg-avenue-secondary">
              Apply
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <h2 className="font-bold text-avenue-text-heading">Overrides by User</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {[...overridesByUser.values()].sort((a, b) => b.count - a.count).map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-semibold text-avenue-text-heading">{row.label}</span>
                <span className="font-bold text-avenue-error">{row.count} ({pct(row.count, overrideEvents)})</span>
              </div>
            ))}
            {overridesByUser.size === 0 && <p className="px-5 py-6 text-center text-sm text-avenue-text-muted">No overrides for this filter.</p>}
          </div>
        </section>

        <section className="rounded-lg border border-[#EEEEEE] bg-white">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <h2 className="font-bold text-avenue-text-heading">Overrides by Facility</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {[...overridesByFacility.values()].sort((a, b) => b.count - a.count).map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-semibold text-avenue-text-heading">{row.label}</span>
                <span className="font-bold text-avenue-error">{row.count} ({pct(row.count, overrideEvents)})</span>
              </div>
            ))}
            {overridesByFacility.size === 0 && <p className="px-5 py-6 text-center text-sm text-avenue-text-muted">No facility overrides for this filter.</p>}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-[#EEEEEE] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EEEEEE] bg-[#F8F9FA] text-xs font-bold uppercase text-avenue-text-muted">
              <th className="px-5 py-3 text-left">Member</th>
              <th className="px-5 py-3 text-left">Facility</th>
              <th className="px-5 py-3 text-left">Flow</th>
              <th className="px-5 py-3 text-left">Outcome</th>
              <th className="px-5 py-3 text-left">Actor</th>
              <th className="px-5 py-3 text-left">Time</th>
              <th className="px-5 py-3 text-right">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3">
                  <p className="font-semibold text-avenue-text-heading">{event.member.firstName} {event.member.lastName}</p>
                  <p className="text-[10px] font-mono text-avenue-text-muted">{event.member.memberNumber}</p>
                </td>
                <td className="px-5 py-3 text-xs text-avenue-text-body">{event.provider?.name ?? "No facility"}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-avenue-indigo/10 px-2 py-0.5 text-[10px] font-bold text-avenue-indigo">
                    {event.flow.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs font-bold text-avenue-text-heading">{event.outcome.replace(/_/g, " ")}</td>
                <td className="px-5 py-3 text-xs text-avenue-text-body">
                  {event.overrideBy
                    ? `${event.overrideBy.firstName} ${event.overrideBy.lastName}`
                    : event.initiatedBy
                      ? `${event.initiatedBy.firstName} ${event.initiatedBy.lastName}`
                      : "Member/device"}
                </td>
                <td className="px-5 py-3 text-xs text-avenue-text-muted">{event.createdAt.toLocaleTimeString()}</td>
                <td className="px-5 py-3 text-right">
                  {event.reviewRequired ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-avenue-error">Required</span>
                  ) : (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">Clear</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-avenue-text-muted">
                  No check-in events match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
