import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { BarChart2, Users, FileText, Receipt, PieChart, TrendingUp, Calculator, HeartPulse } from "lucide-react";

const REPORTS = [
  {
    id: "claims",
    title: "Claims Summary",
    description: "Total claims by status, benefit category, loss ratio, and turnaround times.",
    icon: Receipt,
    color: "bg-[#292A83]/10 text-[#292A83]",
  },
  {
    id: "membership",
    title: "Membership Report",
    description: "Active members by group, status breakdown, and enrollment trends.",
    icon: Users,
    color: "bg-[#28A745]/10 text-[#28A745]",
  },
  {
    id: "preauth",
    title: "Pre-Authorization Report",
    description: "PA approvals, declines, pending, estimated vs approved amounts.",
    icon: FileText,
    color: "bg-[#17A2B8]/10 text-[#17A2B8]",
  },
  {
    id: "billing",
    title: "Billing & Collections",
    description: "Invoiced amounts, collections, aging by group, and payment methods.",
    icon: BarChart2,
    color: "bg-[#FFC107]/10 text-[#856404]",
  },
  {
    id: "utilization",
    title: "Utilization Report",
    description: "Benefit usage by category, high-utilization members, and remaining balances.",
    icon: PieChart,
    color: "bg-[#F5C6B6]/50 text-[#a0522d]",
  },
  {
    id: "endorsements",
    title: "Endorsement Report",
    description: "Endorsements by type and group with pro-rata financial impact.",
    icon: TrendingUp,
    color: "bg-[#6C757D]/10 text-[#6C757D]",
  },
  {
    id: "quotations",
    title: "Quotation Pipeline",
    description: "Quotes generated, conversion rate, average premium, and broker attribution.",
    icon: Calculator,
    color: "bg-[#292A83]/10 text-[#292A83]",
  },
  {
    id: "chronic-disease",
    title: "Chronic Disease Burden",
    description: "ICD-10 diagnosis prevalence, cost per condition, and groups most affected.",
    icon: HeartPulse,
    color: "bg-[#DC3545]/10 text-[#DC3545]",
  },
];

export default async function ReportsPage() {
  const session = await requireRole(ROLES.ANY_STAFF);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Reports</h1>
        <p className="text-avenue-text-body font-body mt-1">Analytics and operational reports for Avenue Healthcare.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.id}
              href={`/reports/${r.id}`}
              className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm hover:shadow-md hover:border-avenue-indigo/30 transition-all group"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${r.color}`}>
                <Icon size={20} />
              </div>
              <h2 className="font-bold text-avenue-text-heading font-heading group-hover:text-avenue-indigo transition-colors">
                {r.title}
              </h2>
              <p className="text-sm text-avenue-text-body mt-1">{r.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
