import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import {
  BarChart2, Users, FileText, Receipt, PieChart, TrendingUp, Calculator,
  HeartPulse, AlertCircle, Building2, UserSquare, AlertTriangle, BedDouble,
  Activity, Percent, LineChart, Clock, BadgeDollarSign, Landmark, Droplets,
  XCircle, UserCheck, ShieldCheck, BarChart3, Stethoscope, CalendarClock, ShieldAlert,
  Scale, CreditCard, Briefcase, ArrowUpDown, Wrench, GitMerge,
} from "lucide-react";

const REPORT_GROUPS = [
  {
    label: "Operational — Go-Live Required",
    reports: [
      { id: "membership",        title: "Membership List",           description: "All active members with cover details, group, package, and status. Exportable.",                   icon: Users,          color: "bg-[#28A745]/10 text-[#28A745]" },
      { id: "outstanding-bills", title: "Outstanding Bills",         description: "Invoices past due date with unpaid balances, grouped by days overdue.",                           icon: AlertCircle,    color: "bg-[#DC3545]/10 text-[#DC3545]" },
      { id: "provider-statements",title: "Provider Statements",      description: "Claims approved and paid per provider for a period — for provider reconciliation.",               icon: Building2,      color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "member-statements", title: "Member Statements",         description: "Per-member utilisation, approved amounts, and co-contribution balance.",                          icon: UserSquare,     color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
      { id: "exceeded-limits",   title: "Exceeded Limits",           description: "Members at >80% and >100% of their annual sub-limit per benefit category.",                       icon: AlertTriangle,  color: "bg-[#FFC107]/10 text-[#856404]" },
      { id: "admissions",        title: "Admissions List",           description: "All inpatient claims — admission and discharge dates, length of stay, provider.",                  icon: BedDouble,      color: "bg-[#F2715A]/50 text-[#C04A39]" },
      { id: "admission-visits",  title: "Admission Visits (OPD)",    description: "Outpatient visit count per member — frequency analysis and high-utilisation flagging.",            icon: Activity,       color: "bg-[#6C757D]/10 text-[#6C757D]" },
    ],
  },
  {
    label: "Clinical & Claims",
    reports: [
      { id: "claims",            title: "Claims Summary",            description: "Total claims by status, benefit category, loss ratio, and turnaround times.",                     icon: Receipt,        color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "preauth",           title: "Pre-Authorization Report",  description: "PA approvals, declines, pending, estimated vs approved amounts.",                                 icon: FileText,       color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
      { id: "utilization",       title: "Utilization Report",        description: "Benefit usage by category, high-utilization members, and remaining balances.",                    icon: PieChart,       color: "bg-[#F2715A]/50 text-[#C04A39]" },
      { id: "exclusion-rejected",title: "Exclusion & Rejected Claims",description: "All declined and voided claims with reason codes — regulatory and audit view.",                 icon: XCircle,        color: "bg-[#DC3545]/10 text-[#DC3545]" },
      { id: "chronic-disease",   title: "Chronic Disease Burden",    description: "ICD-10 diagnosis prevalence, cost per condition, and groups most affected.",                      icon: HeartPulse,     color: "bg-[#DC3545]/10 text-[#DC3545]" },
    ],
  },
  {
    label: "Financial",
    reports: [
      { id: "billing",           title: "Billing & Collections",     description: "Invoiced amounts, collections, and outstanding balances by group.",                              icon: BarChart2,      color: "bg-[#FFC107]/10 text-[#856404]" },
      { id: "loss-ratio",        title: "Loss Ratio",                description: "Premium collected vs claims approved per group — overall and per-scheme loss ratios.",            icon: Percent,        color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "claims-experience", title: "Claims Experience",         description: "Claims count, billed, and approved by group × benefit category.",                               icon: LineChart,      color: "bg-[#28A745]/10 text-[#28A745]" },
      { id: "ageing-analysis",   title: "Ageing Analysis",           description: "Outstanding receivables bucketed into 0-30, 31-60, 61-90, and 91+ days.",                        icon: Clock,          color: "bg-[#DC3545]/10 text-[#DC3545]" },
      { id: "commission-statements",title: "Commission Statements",  description: "Broker commissions earned, paid, and outstanding per group.",                                    icon: BadgeDollarSign,color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
      { id: "levies-taxes",      title: "Levies & Taxes",            description: "Stamp Duty, Training Levy, and PHCF per invoice — IRA regulatory compliance view.",             icon: Landmark,       color: "bg-[#6C757D]/10 text-[#6C757D]" },
      { id: "fund-utilisation",  title: "Fund Utilisation (Self-Funded)", description: "Balance, deposits, claims deducted, and admin fees per self-funded scheme.",               icon: Droplets,       color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
      { id: "debtors-creditors", title: "Debtors & Creditors",       description: "Outstanding receivables from schemes and payables to providers — ageing by bucket.",             icon: Scale,          color: "bg-[#DC3545]/10 text-[#DC3545]" },
      { id: "fees-statements",   title: "Fees Statement",            description: "Card issuance, reinstatement, and admin fees charged across schemes in a period.",               icon: CreditCard,     color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "admin-fee",         title: "Admin Fee Statement (Self-Funded)", description: "Administration fees invoiced to self-funded schemes — flat-per-insured and %-of-claims breakdown.", icon: Briefcase, color: "bg-[#FFC107]/10 text-[#856404]" },
    ],
  },
  {
    label: "Analytical & System",
    reports: [
      { id: "organic-growth",     title: "Organic Growth",            description: "New enrolments vs. lapses vs. cancellations per month — net membership change.",            icon: ArrowUpDown,    color: "bg-[#28A745]/10 text-[#28A745]" },
      { id: "comparison-services",title: "Service Cost Comparison",  description: "Contracted rate vs. average billed vs. average approved per CPT procedure code.",               icon: Wrench,         color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
      { id: "quotation-funnel",  title: "Quotation Funnel",          description: "Quotation pipeline by status — draft, assessed, issued, accepted, declined, expired.",           icon: GitMerge,       color: "bg-[#6C757D]/10 text-[#6C757D]" },
      { id: "endorsements",      title: "Endorsement Report",        description: "Endorsements by type and group with pro-rata financial impact.",                                 icon: TrendingUp,     color: "bg-[#6C757D]/10 text-[#6C757D]" },
      { id: "quotations",        title: "Quotation Pipeline",        description: "Quotes generated, conversion rate, average premium, and broker attribution.",                   icon: Calculator,     color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "claims-per-operator",title: "Claims Per Operator",      description: "Adjudication volume and approval rates per staff member — productivity monitoring.",            icon: UserCheck,      color: "bg-[#28A745]/10 text-[#28A745]" },
      { id: "user-rights-roles", title: "User Rights & Roles",       description: "All users, their roles, active status, and last login — security audit view.",                  icon: ShieldCheck,    color: "bg-[#0B1437]/10 text-[#0B1437]" },
    ],
  },
  {
    label: "Strategic Analytics",
    reports: [
      { id: "analytics-portfolio-mlr",      title: "Portfolio MLR",              description: "Medical loss ratio by scheme from analytics snapshots. Links to scheme drilldowns.",             icon: BarChart3,      color: "bg-[#0B1437]/10 text-[#0B1437]" },
      { id: "analytics-scheme-profitability",title: "Scheme Profitability",      description: "Contribution vs claims across all schemes with MLR trend and alert state.",                      icon: Percent,        color: "bg-[#28A745]/10 text-[#28A745]" },
      { id: "analytics-provider-performance",title: "Provider Performance",      description: "Case-mix-adjusted provider ranking with CMI, rejection rate, and claim volume. Links to drilldowns.", icon: Stethoscope,  color: "bg-[#DC3545]/10 text-[#DC3545]" },
      { id: "analytics-renewal-recommendations",title: "Renewal Recommendations",description: "Schemes due for renewal with trailing MLR, recommended adjustment, and pricing guidance.",       icon: CalendarClock,  color: "bg-[#FFC107]/10 text-[#856404]" },
      { id: "analytics-risk-distribution",  title: "Risk Tier Distribution",     description: "Member risk profile counts and percentages by tier and scheme.",                                  icon: ShieldAlert,    color: "bg-[#17A2B8]/10 text-[#17A2B8]" },
    ],
  },
];

export default async function ReportsPage() {
  await requireRole(ROLES.ANY_STAFF);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Reports</h1>
        <p className="text-avenue-text-body font-body mt-1">
          {REPORT_GROUPS.reduce((s, g) => s + g.reports.length, 0)} reports across {REPORT_GROUPS.length} categories. All reports export to CSV.
        </p>
      </div>

      {REPORT_GROUPS.map(group => (
        <div key={group.label} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-avenue-text-muted border-b border-[#EEEEEE] pb-2">
            {group.label}
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.reports.map((r) => {
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
                  <h3 className="font-bold text-avenue-text-heading font-heading group-hover:text-avenue-indigo transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-sm text-avenue-text-body mt-1">{r.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
