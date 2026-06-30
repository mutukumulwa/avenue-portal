import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { DashboardCharts } from "./DashboardCharts";
import { Users, FileText, CheckCircle, Receipt } from "lucide-react";
import { subMonths, startOfMonth, format } from "date-fns";
import { measureAsync } from "@/lib/perf";

type HRCountsRow = {
  totalActiveMembers: number;
  membersAddedThisMonth: number;
  pendingEndorsements: number;
  outstandingBalance: number;
};

type MemberTrendRow = {
  month: string;
  count: number;
};

export default async function HRDashboard() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;

  if (!groupId) {
    return (
      <div className="p-8 text-center text-avenue-text-muted">
        <p>No corporate group assigned. Please contact your Medvex administrator.</p>
      </div>
    );
  }

  const currentDate = new Date();
  const startOfCurrentMonth = startOfMonth(currentDate);
  const trendStart = startOfMonth(subMonths(currentDate, 11));

  const [
    countsRaw,
    relationshipCounts,
    memberTrendRaw,
    activities,
  ] = await measureAsync("dashboard.hr.data", () =>
    Promise.all([
      prisma.$queryRaw<HRCountsRow[]>`
        SELECT
          (SELECT COUNT(*)::int FROM "Member" WHERE "groupId" = ${groupId} AND status = 'ACTIVE') AS "totalActiveMembers",
          (SELECT COUNT(*)::int FROM "Member" WHERE "groupId" = ${groupId} AND "enrollmentDate" >= ${startOfCurrentMonth}) AS "membersAddedThisMonth",
          (SELECT COUNT(*)::int FROM "Endorsement" WHERE "groupId" = ${groupId} AND status IN ('SUBMITTED','UNDER_REVIEW')) AS "pendingEndorsements",
          (
            SELECT COALESCE(SUM(("totalAmount" - "paidAmount")::float), 0)
            FROM "Invoice"
            WHERE "groupId" = ${groupId}
              AND status IN ('SENT','PARTIALLY_PAID','OVERDUE')
          ) AS "outstandingBalance"
      `,
      prisma.member.groupBy({
        by: ["relationship"],
        where: { groupId, status: "ACTIVE" },
        _count: { relationship: true },
      }),
      prisma.$queryRaw<MemberTrendRow[]>`
        WITH months AS (
          SELECT generate_series(${trendStart}::timestamp, ${startOfCurrentMonth}::timestamp, interval '1 month') AS month_start
        )
        SELECT
          TO_CHAR(month_start, 'Mon YYYY') AS month,
          (
            SELECT COUNT(*)::int
            FROM "Member" m
            WHERE m."groupId" = ${groupId}
              AND m.status = 'ACTIVE'
              AND m."enrollmentDate" < LEAST(month_start + interval '1 month', ${currentDate}::timestamp)
          ) AS count
        FROM months
        ORDER BY month_start
      `,
      prisma.activityLog.findMany({
        where: { groupId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])
  );

  const counts = countsRaw[0];
  const totalActiveMembers = Number(counts?.totalActiveMembers ?? 0);
  const membersAddedThisMonth = Number(counts?.membersAddedThisMonth ?? 0);
  const pendingEndorsements = Number(counts?.pendingEndorsements ?? 0);
  const outstandingBalance = Number(counts?.outstandingBalance ?? 0);

  const relationshipData = relationshipCounts.map(item => ({
    name: item.relationship.charAt(0) + item.relationship.slice(1).toLowerCase(),
    value: item._count.relationship
  }));

  const memberTrendData = memberTrendRaw.map(row => ({
    month: row.month,
    count: Number(row.count),
  }));

  const kpis = [
    { label: "Total Active Members", value: totalActiveMembers, icon: Users },
    { label: "Added This Month", value: membersAddedThisMonth, icon: CheckCircle },
    { label: "Pending Endorsements", value: pendingEndorsements, icon: FileText },
    { label: "Outstanding Balance", value: `KES ${outstandingBalance.toLocaleString()}`, icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Dashboard</h1>
        <p className="text-avenue-text-body font-body mt-1">Overview of your corporate membership.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white p-5 rounded-xl border border-[#EEEEEE] shadow-sm flex items-start justify-between font-ui">
              <div>
                <p className="text-[11px] font-bold text-avenue-text-muted uppercase tracking-wide mb-2">{kpi.label}</p>
                <p className="text-2xl font-bold text-avenue-text-heading tabular-nums">{kpi.value}</p>
              </div>
              <div className="bg-avenue-indigo/5 p-3 rounded-xl">
                <Icon className="w-5 h-5 text-avenue-indigo" />
              </div>
            </div>
          );
        })}
      </div>

      <DashboardCharts memberTrendData={memberTrendData} relationshipData={relationshipData} />

      <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-sm overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
          <h3 className="font-bold text-avenue-text-heading font-heading">Recent Activity</h3>
        </div>
        
        {activities.length === 0 ? (
          <div className="p-8 text-center text-sm text-avenue-text-body">No recent activity.</div>
        ) : (
          <ul className="divide-y divide-[#EEEEEE]">
            {activities.map((log) => (
              <li key={log.id} className="px-5 py-3 flex text-sm items-center justify-between">
                <div>
                  <span className="font-bold text-avenue-text-heading">{log.action.replace(/_/g, " ")}</span>
                  <span className="text-avenue-text-body"> &mdash; {log.description}</span>
                </div>
                <div className="text-xs text-avenue-text-muted">
                  {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
