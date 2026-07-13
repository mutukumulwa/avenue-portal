"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard:    "Dashboard",
  groups:       "Groups",
  members:      "Members",
  endorsements: "Endorsements",
  packages:     "Packages",
  claims:       "Claims",
  preauth:      "Pre-Authorizations",
  providers:    "Providers",
  billing:      "Billing",
  gl:           "General Ledger",
  ledger:       "Account Ledger",
  brokers:      "Brokers",
  quotations:   "Quotations",
  reports:      "Reports",
  settings:     "Settings",
  tenants:      "Tenants",
  exceptions:   "Exceptions",
  "new":        "New",
  // Analytics
  analytics:    "Strategic Analytics",
  schemes:      "Scheme",
  renewals:     "Renewal",
  alerts:       "Alerts",
  risk:         "Member Risk",
  // Fund
  fund:         "Self-Funded",
  // HR portal
  hr:           "HR Portal",
  roster:       "Roster",
  utilization:  "Utilization",
  invoices:     "Invoices",
  // Broker portal
  broker:       "Broker Portal",
  submissions:  "Submissions",
  commissions:  "Commissions",
  // Report types (appear as second segment after /reports/)
  "loss-ratio":              "Loss Ratio",
  "claims-experience":       "Claims Experience",
  "provider-statements":     "Provider Statements",
  "member-statements":       "Member Statements",
  "outstanding-bills":       "Outstanding Bills",
  "exceeded-limits":         "Exceeded Limits",
  "chronic-disease":         "Chronic Disease Burden",
  "ageing-analysis":         "Ageing Analysis",
  "commission-statements":   "Commission Statements",
  "levies-taxes":            "Levies & Taxes",
  "fund-utilisation":        "Fund Utilisation",
  "exclusion-rejected":      "Exclusion & Rejected",
  "claims-per-operator":     "Claims Per Operator",
  "user-rights-roles":       "User Rights & Roles",
  "analytics-portfolio-mlr":            "Portfolio MLR",
  "analytics-scheme-profitability":     "Scheme Profitability",
  "analytics-provider-performance":     "Provider Performance",
  "analytics-renewal-recommendations":  "Renewal Recommendations",
  "analytics-risk-distribution":        "Risk Tier Distribution",
  // Misc
  "check-ins":       "Secure Check-Ins",
  "service-requests": "Service Requests",
  complaints:        "Complaints",
  fraud:             "Fraud Alerts",
  "approval-matrix": "Approval Matrix",
  "audit-log":       "Audit Log",
  reprice:           "Repricing",
  reimbursement:     "Reimbursement",
  calculator:        "Calculator",
  builder:           "Builder",
  edit:              "Edit",
  import:            "Import",
  profile:           "Profile",
  support:           "Support",
  visit:             "Visit",
};

function isId(s: string) {
  // UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // cuid v1: starts with 'c', 25 chars, alphanumeric
  if (/^c[a-z0-9]{20,}$/.test(s)) return true;
  // cuid v2 / nanoid: 20+ lowercase alphanumeric chars (no hyphens)
  if (/^[a-z0-9]{20,}$/.test(s)) return true;
  return false;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build crumbs: each crumb has a label and href
  const crumbs: { label: string; href: string }[] = [];
  let path = "";

  for (const seg of segments) {
    path += `/${seg}`;
    const label = SEGMENT_LABELS[seg] ?? (isId(seg) ? "Detail" : seg);
    crumbs.push({ label, href: path });
  }

  // Only show breadcrumbs when there's more than one segment
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-brand-text-muted mb-4">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="text-[#CCCCCC]" />}
            {isLast ? (
              <span className="font-semibold text-brand-text-heading">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-brand-indigo transition-colors font-medium">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
