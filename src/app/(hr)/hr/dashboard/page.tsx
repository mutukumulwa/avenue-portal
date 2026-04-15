import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { DashboardCharts } from "./DashboardCharts";
import { Users, FileText, CheckCircle, Receipt } from "lucide-react";
import { subMonths, startOfMonth, format } from "date-fns";

export default async function HRDashboard() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;

  if (!groupId) {
    return (
      <div className="p-8 text-center text-avenue-text-muted">
        <p>No corporate group assigned. Please contact your Avenue administrator.</p>
      </div>
    );
  }

  const currentDate = new Date();
  const startOfCurrentMonth = startOfMonth(currentDate);

  const [
    totalActiveMembers,
    membersAddedThisMonth,
    pendingEndorsements,
    invoices,
    activities
  ] = await Promise.all([
    prisma.member.count({
      where: { groupId, status: "ACTIVE" }
    }),
    prisma.member.count({
      where: { 
        groupId, 
        enrollmentDate: { gte: startOfCurrentMonth } 
      }
    }),
    prisma.endorsement.count({
      where: { 
        groupId, 
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] } 
      }
    }),
    prisma.invoice.findMany({
      where: { 
        groupId, 
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } 
      },
      select: { totalAmount: true, paidAmount: true }
    }),
    prisma.activityLog.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const outstandingBalance = invoices.reduce(
    (acc, inv) => acc + (Number(inv.totalAmount) - Number(inv.paidAmount)), 
    0
  );

  // Group membership by relationship
  const relationshipCounts = await prisma.member.groupBy({
    by: ['relationship'],
    where: { groupId, status: "ACTIVE" },
    _count: { relationship: true }
  });

  const relationshipData = relationshipCounts.map(item => ({
    name: item.relationship.charAt(0) + item.relationship.slice(1).toLowerCase(),
    value: item._count.relationship
  }));

  // Build 12-month trend array
  const memberTrendData = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(currentDate, i);
    const mthEnd = startOfMonth(subMonths(currentDate, i - 1));

    // Notice: Approximating active counts based on enrollment date for demo
    const count = await prisma.member.count({
      where: {
        groupId,
        status: "ACTIVE",
        enrollmentDate: { lt: (i === 0 ? currentDate : mthEnd) }
      }
    });

    memberTrendData.push({
      month: format(d, "MMM yyyy"),
      count
    });
  }

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
            <div key={kpi.label} className="bg-white p-5 rounded-xl border border-[#EEEEEE] shadow-sm flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-avenue-text-muted uppercase tracking-wider mb-2">{kpi.label}</p>
                <p className="text-2xl font-bold text-avenue-text-heading">{kpi.value}</p>
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
