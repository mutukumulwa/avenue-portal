import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Activity, ShieldCheck, FileText, AlertTriangle } from "lucide-react";

export default async function HRUtilizationPage() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId!;

  // 1. Fetch group to establish current invoice baseline
  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId: session.user.tenantId }
  });

  // 2. Aggregate all claim amounts for this group
  const claimAgg = await prisma.claim.aggregate({
    where: {
      tenantId: session.user.tenantId,
      member: { groupId }
    },
    _count: true,
    _sum: {
      billedAmount: true,
      approvedAmount: true
    }
  });

  // 3. Claims grouped by category
  const categoryAggRaw = await prisma.claim.groupBy({
    by: ["benefitCategory"],
    where: {
      tenantId: session.user.tenantId,
      member: { groupId }
    },
    _count: true,
    _sum: { approvedAmount: true }
  });

  const totalClaimsCount = claimAgg._count || 0;
  const totalApproved = Number(claimAgg._sum.approvedAmount || 0);

  // Derive Loss Ratio (if we have group billing limits tracked via invoices)
  // For HR, active group invoices represent "premium paid"
  const invoiceAgg = await prisma.invoice.aggregate({
    where: { groupId, tenantId: session.user.tenantId },
    _sum: { totalAmount: true }
  });
  const totalPremium = Number(invoiceAgg._sum.totalAmount || 0);
  const lossRatio = totalPremium > 0 ? (totalApproved / totalPremium) * 100 : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Utilization Dashboard</h1>
          <p className="text-avenue-text-body mt-1">Real-time aggregate benefit usage for {group?.name || "your group"}.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Claims", value: totalClaimsCount.toLocaleString(), icon: FileText, color: "text-[#17A2B8]" },
          { label: "Total Invoiced (Premium)", value: `KES ${totalPremium.toLocaleString()}`, icon: ShieldCheck, color: "text-avenue-indigo" },
          { label: "Total Approved Spend", value: `KES ${totalApproved.toLocaleString()}`, icon: Activity, color: "text-[#28A745]" },
          { 
            label: "Fund Utilization (Loss Ratio)", 
            value: `${lossRatio.toFixed(1)}%`, 
            icon: AlertTriangle, 
            color: lossRatio > 85 ? "text-[#DC3545]" : (lossRatio > 70 ? "text-[#FFC107]" : "text-[#28A745]")
          },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <p className="text-xs font-bold text-avenue-text-muted uppercase tracking-wide">{s.label}</p>
                <Icon size={16} className={`opacity-50 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm">
          <h3 className="font-bold text-avenue-text-heading mb-4">Spend by Benefit Category</h3>
          <div className="space-y-4">
            {categoryAggRaw.sort((a,b) => Number(b._sum.approvedAmount) - Number(a._sum.approvedAmount)).map(c => (
              <div key={c.benefitCategory}>
                <div className="flex justify-between items-end mb-1">
                  <span className="text-sm font-semibold">{c.benefitCategory}</span>
                  <span className="text-sm font-bold text-avenue-indigo">KES {Number(c._sum.approvedAmount || 0).toLocaleString()}</span>
                </div>
                <div className="w-full bg-[#EEEEEE] rounded-full h-2">
                  <div 
                    className="bg-avenue-indigo h-2 rounded-full" 
                    style={{ width: `${totalApproved > 0 ? (Number(c._sum.approvedAmount || 0) / totalApproved) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-avenue-text-muted mt-1">{c._count} claims</p>
              </div>
            ))}
            {categoryAggRaw.length === 0 && (
              <p className="text-sm text-avenue-text-muted text-center py-6">No localized claims data available yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm flex flex-col justify-center text-center">
          <Activity size={40} className="mx-auto text-avenue-border mb-4" />
          <h3 className="font-bold text-avenue-text-heading text-lg">Detailed Trending</h3>
          <p className="text-sm text-avenue-text-muted mt-2 max-w-sm mx-auto">
            Rich interactive Recharts for month-over-month utilization trends are actively recording context.
            Trend lines will populate here after 30 days of active claim ingestion.
          </p>
        </div>
      </div>
    </div>
  );
}
