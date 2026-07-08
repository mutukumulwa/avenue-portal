import { requireRole, ROLES } from "@/lib/rbac";
import { getAnalyticsAccessScope, type AnalyticsAccessScope } from "@/lib/analytics-access";
import { prisma } from "@/lib/prisma";
import { getExclusionRejectionRows } from "@/server/services/report-exclusions";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { ExportPDFButton } from "@/components/pdf/ExportPDFButton";

const REPORT_TITLES: Record<string, string> = {
  // Existing
  claims:                  "Claims Summary Report",
  membership:              "Membership List Report",
  preauth:                 "Pre-Authorization Report",
  billing:                 "Billing & Collections Report",
  utilization:             "Utilization Report",
  endorsements:            "Endorsement Report",
  quotations:              "Quotation Pipeline Report",
  "chronic-disease":       "Chronic Disease Burden Report",
  // Tranche 1 — go-live blockers
  "outstanding-bills":     "Outstanding Bills Report",
  "provider-statements":   "Provider Statements Report",
  "member-statements":     "Member Statements Report",
  "exceeded-limits":       "Exceeded Limits Report",
  admissions:              "Admissions List Report",
  "admission-visits":      "Admission Visits Report",
  // Tranche 2 — financial
  "loss-ratio":            "Loss Ratio Report",
  "claims-experience":     "Claims Experience by Scheme",
  "ageing-analysis":       "Ageing Analysis Report",
  "commission-statements": "Commission Statements Report",
  "levies-taxes":          "Levies & Taxes Report",
  "fund-utilisation":      "Fund Utilisation Report (Self-Funded)",
  // Tranche 3 — analytical
  "exclusion-rejected":    "Exclusion & Rejected Claims Report",
  "claims-per-operator":   "Claims Per Operator Report",
  "user-rights-roles":     "User Rights & Roles Report",
  // Strategic analytics
  "analytics-portfolio-mlr":          "Portfolio MLR Report",
  "analytics-scheme-profitability":   "Scheme Profitability Report",
  "analytics-provider-performance":   "Provider Performance Report",
  "analytics-renewal-recommendations":"Renewal Recommendations Report",
  "analytics-risk-distribution":      "Risk Tier Distribution Report",
  // Tranche 2 additions
  "debtors-creditors":  "Debtors & Creditors Report",
  "fees-statements":    "Fees Statement Report",
  "admin-fee":          "Admin Fee Statement (Self-Funded)",
  // Tranche 3 additions
  "organic-growth":       "Organic Growth Report",
  "comparison-services":  "Service Cost Comparison Report",
  "quotation-funnel":     "Quotation Funnel Report",
};

type Cell = string | { text: string; href: string };
type ReportResult = { kpis: { label: string; value: string }[]; headers: string[]; data: Cell[][] };

function reportGroupIdWhere(scope?: AnalyticsAccessScope) {
  if (!scope) return {};
  if (scope.noAccess) return { groupId: "__no_access__" };
  if (scope.groupId) return { groupId: scope.groupId };
  if (scope.allowedGroupIds) return scope.allowedGroupIds.length > 0 ? { groupId: { in: scope.allowedGroupIds } } : { groupId: "__no_access__" };
  return {};
}

function reportGroupWhere(scope?: AnalyticsAccessScope) {
  if (!scope) return {};
  if (scope.noAccess) return { id: "__no_access__" };
  if (scope.groupId) return { id: scope.groupId };
  if (scope.allowedGroupIds) return scope.allowedGroupIds.length > 0 ? { id: { in: scope.allowedGroupIds } } : { id: "__no_access__" };
  return {};
}

// ── Data fetchers per report type ─────────────────────────────────────────────

async function getClaimsData(tenantId: string) {
  const rows = await prisma.claim.findMany({
    where: { tenantId },
    select: {
      claimNumber: true, status: true, billedAmount: true, approvedAmount: true,
      benefitCategory: true, createdAt: true,
      member: { select: { firstName: true, lastName: true } },
      provider: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const total = rows.reduce((s, r) => s + Number(r.billedAmount), 0);
  const approved = rows.reduce((s, r) => s + Number(r.approvedAmount ?? 0), 0);
  const kpis = [
    { label: "Total Claims",        value: rows.length.toLocaleString() },
    { label: "Total Billed (UGX)",  value: total.toLocaleString() },
    { label: "Total Approved (UGX)",value: approved.toLocaleString() },
    { label: "Loss Ratio",          value: total > 0 ? `${((approved / total) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Claim No.", "Member", "Provider", "Category", "Billed (UGX)", "Approved (UGX)", "Status", "Date"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName}`,
    r.provider.name,
    r.benefitCategory,
    Number(r.billedAmount).toLocaleString(),
    r.approvedAmount ? Number(r.approvedAmount).toLocaleString() : "—",
    r.status.replace(/_/g, " "),
    new Date(r.createdAt).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

async function getMembershipData(tenantId: string) {
  const rows = await prisma.member.findMany({
    where: { tenantId },
    select: {
      memberNumber: true, firstName: true, lastName: true, status: true,
      relationship: true, gender: true, enrollmentDate: true,
      group: { select: { name: true } },
      package: { select: { name: true } },
    },
    orderBy: { enrollmentDate: "desc" },
    take: 100,
  });
  const active = rows.filter(r => r.status === "ACTIVE").length;
  const kpis = [
    { label: "Total Members",  value: rows.length.toLocaleString() },
    { label: "Active",         value: active.toLocaleString() },
    { label: "Inactive",       value: (rows.length - active).toLocaleString() },
    { label: "% Active",       value: rows.length > 0 ? `${((active / rows.length) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Member No.", "Name", "Group", "Package", "Relationship", "Gender", "Status", "Enrolled"];
  const data = rows.map(r => [
    r.memberNumber,
    `${r.firstName} ${r.lastName}`,
    r.group.name,
    r.package.name,
    r.relationship,
    r.gender,
    r.status,
    new Date(r.enrollmentDate).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

async function getPreauthData(tenantId: string) {
  const rows = await prisma.preAuthorization.findMany({
    where: { tenantId },
    select: {
      preauthNumber: true, status: true, benefitCategory: true,
      estimatedCost: true, approvedAmount: true, createdAt: true,
      member: { select: { firstName: true, lastName: true } },
      provider: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const approved = rows.filter(r => r.status === "APPROVED").length;
  const declined = rows.filter(r => r.status === "DECLINED").length;
  const kpis = [
    { label: "Total Pre-Auths", value: rows.length.toLocaleString() },
    { label: "Approved",        value: approved.toLocaleString() },
    { label: "Declined",        value: declined.toLocaleString() },
    { label: "Approval Rate",   value: rows.length > 0 ? `${((approved / rows.length) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["PA No.", "Member", "Provider", "Category", "Estimated (UGX)", "Approved (UGX)", "Status", "Date"];
  const data = rows.map(r => [
    r.preauthNumber,
    `${r.member.firstName} ${r.member.lastName}`,
    r.provider.name,
    r.benefitCategory,
    Number(r.estimatedCost).toLocaleString(),
    r.approvedAmount ? Number(r.approvedAmount).toLocaleString() : "—",
    r.status,
    new Date(r.createdAt).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

async function getBillingData(tenantId: string) {
  const rows = await prisma.invoice.findMany({
    where: { tenantId },
    select: {
      invoiceNumber: true, period: true, memberCount: true,
      totalAmount: true, paidAmount: true, balance: true,
      status: true, dueDate: true,
      group: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const totalBilled    = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
  const totalCollected = rows.reduce((s, r) => s + Number(r.paidAmount), 0);
  const kpis = [
    { label: "Total Invoices",      value: rows.length.toLocaleString() },
    { label: "Total Billed (UGX)",  value: totalBilled.toLocaleString() },
    { label: "Collected (UGX)",     value: totalCollected.toLocaleString() },
    { label: "Outstanding (UGX)",   value: (totalBilled - totalCollected).toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Members", "Total (UGX)", "Paid (UGX)", "Balance (UGX)", "Status"];
  const data = rows.map(r => [
    r.invoiceNumber,
    r.group.name,
    r.period,
    r.memberCount.toString(),
    Number(r.totalAmount).toLocaleString(),
    Number(r.paidAmount).toLocaleString(),
    Number(r.balance).toLocaleString(),
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

async function getUtilizationData(tenantId: string) {
  const rows = await prisma.benefitUsage.findMany({
    where: { member: { tenantId } },
    select: {
      amountUsed: true, periodStart: true, periodEnd: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true, group: { select: { name: true } } } },
      benefitConfig: { select: { category: true, annualSubLimit: true } },
    },
    orderBy: { amountUsed: "desc" },
    take: 100,
  });
  const totalUsed  = rows.reduce((s, r) => s + Number(r.amountUsed), 0);
  const totalLimit = rows.reduce((s, r) => s + Number(r.benefitConfig.annualSubLimit), 0);
  const kpis = [
    { label: "Records",          value: rows.length.toLocaleString() },
    { label: "Total Used (UGX)", value: totalUsed.toLocaleString() },
    { label: "Total Limit (UGX)",value: totalLimit.toLocaleString() },
    { label: "Utilization %",    value: totalLimit > 0 ? `${((totalUsed / totalLimit) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Member No.", "Name", "Group", "Benefit", "Limit (UGX)", "Used (UGX)", "Remaining (UGX)", "Period"];
  const data = rows.map(r => {
    const limit = Number(r.benefitConfig.annualSubLimit);
    const used  = Number(r.amountUsed);
    const period = `${new Date(r.periodStart).toLocaleDateString("en-UG", { month: "short", year: "numeric" })} – ${new Date(r.periodEnd).toLocaleDateString("en-UG", { month: "short", year: "numeric" })}`;
    return [
      r.member.memberNumber,
      `${r.member.firstName} ${r.member.lastName}`,
      r.member.group.name,
      r.benefitConfig.category,
      limit.toLocaleString(),
      used.toLocaleString(),
      Math.max(0, limit - used).toLocaleString(),
      period,
    ];
  });
  return { kpis, headers, data };
}

async function getEndorsementsData(tenantId: string) {
  const rows = await prisma.endorsement.findMany({
    where: { tenantId },
    select: {
      endorsementNumber: true, type: true, status: true,
      effectiveDate: true, proratedAmount: true, createdAt: true,
      group: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const applied  = rows.filter(r => r.status === "APPLIED").length;
  const totalAdj = rows.reduce((s, r) => s + Number(r.proratedAmount ?? 0), 0);
  const kpis = [
    { label: "Total Endorsements",   value: rows.length.toLocaleString() },
    { label: "Applied",              value: applied.toLocaleString() },
    { label: "Submitted / Review",   value: rows.filter(r => ["SUBMITTED", "UNDER_REVIEW"].includes(r.status)).length.toLocaleString() },
    { label: "Net Adjustment (UGX)", value: totalAdj.toLocaleString() },
  ];
  const headers = ["Endorsement No.", "Group", "Type", "Status", "Effective Date", "Adj. (UGX)", "Created"];
  const data = rows.map(r => [
    r.endorsementNumber,
    r.group.name,
    r.type.replace(/_/g, " "),
    r.status,
    new Date(r.effectiveDate).toLocaleDateString("en-UG"),
    r.proratedAmount ? Number(r.proratedAmount).toLocaleString() : "—",
    new Date(r.createdAt).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

async function getQuotationsData(tenantId: string) {
  const rows = await prisma.quotation.findMany({
    where: { tenantId },
    select: {
      quoteNumber: true, status: true, annualPremium: true,
      memberCount: true, validUntil: true, createdAt: true,
      group: { select: { name: true } },
      prospectName: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const accepted     = rows.filter(r => r.status === "ACCEPTED").length;
  const totalPremium = rows.filter(r => r.status === "ACCEPTED").reduce((s, r) => s + Number(r.annualPremium ?? 0), 0);
  const kpis = [
    { label: "Total Quotes",           value: rows.length.toLocaleString() },
    { label: "Accepted",               value: accepted.toLocaleString() },
    { label: "Win Rate",               value: rows.length > 0 ? `${((accepted / rows.length) * 100).toFixed(1)}%` : "—" },
    { label: "Accepted Premium (UGX)", value: totalPremium.toLocaleString() },
  ];
  const headers = ["Quote No.", "Group / Prospect", "Members", "Annual Premium (UGX)", "Status", "Valid Until", "Created"];
  const data = rows.map(r => [
    r.quoteNumber,
    r.group?.name ?? r.prospectName ?? "—",
    r.memberCount?.toString() ?? "—",
    r.annualPremium ? Number(r.annualPremium).toLocaleString() : "—",
    r.status,
    r.validUntil ? new Date(r.validUntil).toLocaleDateString("en-UG") : "—",
    new Date(r.createdAt).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

async function getChronicDiseaseData(tenantId: string) {
  // Fetch all approved/paid claims with their diagnoses JSON
  const claims = await prisma.claim.findMany({
    where: { tenantId, status: { in: ["APPROVED", "PAID", "PARTIALLY_APPROVED"] } },
    select: {
      diagnoses: true,
      approvedAmount: true,
      createdAt: true,
      member: { select: { group: { select: { name: true } } } },
    },
  });

  // Aggregate by primary ICD code
  const byCode = new Map<
    string,
    { description: string; count: number; totalCost: number; groups: Set<string> }
  >();

  for (const claim of claims) {
    const diagnoses = claim.diagnoses as {
      code?: string; icdCode?: string; description: string; isPrimary?: boolean;
    }[];
    if (!Array.isArray(diagnoses)) continue;

    for (const d of diagnoses) {
      const code = d.code ?? d.icdCode ?? "UNKNOWN";
      const entry = byCode.get(code) ?? {
        description: d.description,
        count: 0,
        totalCost: 0,
        groups: new Set<string>(),
      };
      entry.count += 1;
      entry.totalCost += Number(claim.approvedAmount ?? 0);
      entry.groups.add(claim.member.group.name);
      byCode.set(code, entry);
    }
  }

  // Sort by count descending, take top 50
  const sorted = Array.from(byCode.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 50);

  const totalConditions = sorted.length;
  const topCondition = sorted[0] ? `${sorted[0][0]} — ${sorted[0][1].description}` : "—";
  const totalSpend = sorted.reduce((s, [, v]) => s + v.totalCost, 0);

  const kpis = [
    { label: "Unique Conditions", value: totalConditions.toLocaleString() },
    { label: "Top Condition",     value: topCondition },
    { label: "Total Spend (UGX)", value: totalSpend.toLocaleString() },
    { label: "Avg Cost / Case",   value: sorted.length > 0 ? Math.round(totalSpend / sorted.reduce((s, [, v]) => s + v.count, 0)).toLocaleString() : "—" },
  ];

  const headers = ["ICD Code", "Condition / Diagnosis", "Cases", "Total Approved (UGX)", "Avg Cost (UGX)", "Groups Affected"];
  const data = sorted.map(([code, v]) => [
    code,
    v.description,
    v.count.toLocaleString(),
    v.totalCost.toLocaleString(),
    Math.round(v.totalCost / v.count).toLocaleString(),
    v.groups.size.toLocaleString(),
  ]);

  return { kpis, headers, data };
}

// ── TRANCHE 1: Go-live blockers ───────────────────────────────────────────────

async function getOutstandingBillsData(tenantId: string) {
  const rows = await prisma.invoice.findMany({
    where: { tenantId, status: { in: ["OVERDUE", "PARTIALLY_PAID", "SENT"] }, balance: { gt: 0 } },
    select: {
      invoiceNumber: true, period: true, dueDate: true, totalAmount: true,
      paidAmount: true, balance: true, status: true, createdAt: true,
      group: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.balance), 0);
  const overdue = rows.filter(r => r.status === "OVERDUE");
  const kpis = [
    { label: "Outstanding Invoices",    value: rows.length.toLocaleString() },
    { label: "Total Outstanding (UGX)", value: totalOutstanding.toLocaleString() },
    { label: "Overdue",                 value: overdue.length.toLocaleString() },
    { label: "Overdue Amount (UGX)",    value: overdue.reduce((s, r) => s + Number(r.balance), 0).toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Due Date", "Total (UGX)", "Paid (UGX)", "Balance (UGX)", "Status", "Days Overdue"];
  const today = new Date();
  const data = rows.map(r => {
    const due = new Date(r.dueDate);
    const daysOverdue = due < today ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0;
    return [
      r.invoiceNumber,
      r.group.name,
      r.period,
      due.toLocaleDateString("en-UG"),
      Number(r.totalAmount).toLocaleString(),
      Number(r.paidAmount).toLocaleString(),
      Number(r.balance).toLocaleString(),
      r.status.replace(/_/g, " "),
      daysOverdue > 0 ? daysOverdue.toString() : "—",
    ];
  });
  return { kpis, headers, data };
}

async function getProviderStatementsData(tenantId: string): Promise<ReportResult> {
  const rows = await prisma.claim.findMany({
    where: { tenantId, status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } },
    select: {
      claimNumber: true, dateOfService: true, billedAmount: true,
      approvedAmount: true, paidAmount: true, status: true,
      benefitCategory: true,
      provider: { select: { id: true, name: true, type: true } },
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: [{ provider: { name: "asc" } }, { dateOfService: "desc" }],
  });
  const totalApproved = rows.reduce((s, r) => s + Number(r.approvedAmount), 0);
  const totalPaid     = rows.reduce((s, r) => s + Number(r.paidAmount), 0);
  const providers     = new Set(rows.map(r => r.provider.id)).size;
  const kpis = [
    { label: "Claims",                value: rows.length.toLocaleString() },
    { label: "Providers",             value: providers.toLocaleString() },
    { label: "Total Approved (UGX)",  value: totalApproved.toLocaleString() },
    { label: "Total Paid (UGX)",      value: totalPaid.toLocaleString() },
  ];
  const headers = ["Provider", "Claim No.", "Member", "Category", "Date of Service", "Billed (UGX)", "Approved (UGX)", "Paid (UGX)", "Status"];
  const data: Cell[][] = rows.map(r => [
    { text: r.provider.name, href: `/analytics/providers/${r.provider.id}?from=report` },
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.benefitCategory.replace(/_/g, " "),
    new Date(r.dateOfService).toLocaleDateString("en-UG"),
    Number(r.billedAmount).toLocaleString(),
    Number(r.approvedAmount).toLocaleString(),
    Number(r.paidAmount).toLocaleString(),
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

async function getMemberStatementsData(tenantId: string) {
  const members = await prisma.member.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: {
      memberNumber: true, firstName: true, lastName: true,
      group: { select: { name: true } },
      package: { select: { name: true, annualLimit: true } },
      claims: {
        where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } },
        select: { billedAmount: true, approvedAmount: true, paidAmount: true },
      },
      coContributionTransactions: {
        select: { finalAmount: true, amountCollected: true, collectionStatus: true },
      },
    },
    orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }],
    take: 200,
  });

  const kpis = [
    { label: "Members",              value: members.length.toLocaleString() },
    { label: "Total Billed (UGX)",   value: members.reduce((s, m) => s + m.claims.reduce((c, cl) => c + Number(cl.billedAmount), 0), 0).toLocaleString() },
    { label: "Total Approved (UGX)", value: members.reduce((s, m) => s + m.claims.reduce((c, cl) => c + Number(cl.approvedAmount), 0), 0).toLocaleString() },
    { label: "Co-Contrib Collected", value: members.reduce((s, m) => s + m.coContributionTransactions.reduce((c, t) => c + Number(t.amountCollected ?? 0), 0), 0).toLocaleString() },
  ];
  const headers = ["Member No.", "Name", "Group", "Package", "Claims", "Total Billed (UGX)", "Approved (UGX)", "Co-Contrib Owed (UGX)", "Co-Contrib Paid (UGX)"];
  const data = members.map(m => {
    const billed   = m.claims.reduce((s, c) => s + Number(c.billedAmount), 0);
    const approved = m.claims.reduce((s, c) => s + Number(c.approvedAmount), 0);
    const coOwed   = m.coContributionTransactions.reduce((s, t) => s + Number(t.finalAmount), 0);
    const coPaid   = m.coContributionTransactions.reduce((s, t) => s + Number(t.amountCollected ?? 0), 0);
    return [
      m.memberNumber,
      `${m.firstName} ${m.lastName}`,
      m.group.name,
      m.package.name,
      m.claims.length.toString(),
      billed.toLocaleString(),
      approved.toLocaleString(),
      coOwed.toLocaleString(),
      coPaid.toLocaleString(),
    ];
  });
  return { kpis, headers, data };
}

async function getExceededLimitsData(tenantId: string) {
  const usages = await prisma.benefitUsage.findMany({
    where: { member: { tenantId, status: "ACTIVE" } },
    select: {
      amountUsed: true,
      member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } },
      benefitConfig: { select: { category: true, annualSubLimit: true } },
    },
  });

  const flagged = usages
    .map(u => ({
      ...u,
      pct: Number(u.benefitConfig.annualSubLimit) > 0
        ? (Number(u.amountUsed) / Number(u.benefitConfig.annualSubLimit)) * 100
        : 0,
    }))
    .filter(u => u.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  const exceeded = flagged.filter(u => u.pct >= 100);
  const kpis = [
    { label: "At >80% of Limit", value: flagged.length.toLocaleString() },
    { label: "Limit Exceeded",   value: exceeded.length.toLocaleString() },
    { label: "Avg Utilisation",  value: flagged.length > 0 ? `${(flagged.reduce((s, u) => s + u.pct, 0) / flagged.length).toFixed(1)}%` : "—" },
    { label: "Max Utilisation",  value: flagged[0] ? `${flagged[0].pct.toFixed(1)}%` : "—" },
  ];
  const headers = ["Member No.", "Name", "Group", "Benefit Category", "Limit (UGX)", "Used (UGX)", "Utilisation %", "Status"];
  const data = flagged.map(u => [
    u.member.memberNumber,
    `${u.member.firstName} ${u.member.lastName}`,
    u.member.group.name,
    u.benefitConfig.category.replace(/_/g, " "),
    Number(u.benefitConfig.annualSubLimit).toLocaleString(),
    Number(u.amountUsed).toLocaleString(),
    `${u.pct.toFixed(1)}%`,
    u.pct >= 100 ? "EXCEEDED" : "WARNING",
  ]);
  return { kpis, headers, data };
}

async function getAdmissionsData(tenantId: string) {
  const rows = await prisma.claim.findMany({
    where: { tenantId, serviceType: "INPATIENT" },
    select: {
      claimNumber: true, dateOfService: true, admissionDate: true,
      dischargeDate: true, lengthOfStay: true, billedAmount: true,
      approvedAmount: true, status: true, attendingDoctor: true,
      member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } },
      provider: { select: { name: true } },
    },
    orderBy: { admissionDate: "desc" },
    take: 200,
  });
  const totalBilled   = rows.reduce((s, r) => s + Number(r.billedAmount), 0);
  const avgLOS        = rows.filter(r => r.lengthOfStay).reduce((s, r) => s + (r.lengthOfStay ?? 0), 0) / Math.max(1, rows.filter(r => r.lengthOfStay).length);
  const kpis = [
    { label: "Total Admissions",    value: rows.length.toLocaleString() },
    { label: "Total Billed (UGX)",  value: totalBilled.toLocaleString() },
    { label: "Avg Length of Stay",  value: `${avgLOS.toFixed(1)} days` },
    { label: "Unique Providers",    value: new Set(rows.map(r => r.provider.name)).size.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Group", "Provider", "Admission Date", "Discharge Date", "LOS (Days)", "Billed (UGX)", "Status"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.member.group.name,
    r.provider.name,
    r.admissionDate ? new Date(r.admissionDate).toLocaleDateString("en-UG") : "—",
    r.dischargeDate ? new Date(r.dischargeDate).toLocaleDateString("en-UG") : "—",
    r.lengthOfStay?.toString() ?? "—",
    Number(r.billedAmount).toLocaleString(),
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

async function getAdmissionVisitsData(tenantId: string) {
  const rows = await prisma.claim.findMany({
    where: { tenantId, serviceType: "OUTPATIENT" },
    select: {
      claimNumber: true, dateOfService: true, billedAmount: true, status: true,
      benefitCategory: true,
      member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } },
      provider: { select: { name: true } },
    },
    orderBy: { dateOfService: "desc" },
    take: 300,
  });
  const totalBilled = rows.reduce((s, r) => s + Number(r.billedAmount), 0);
  const byMember = new Map<string, number>();
  rows.forEach(r => {
    const key = r.member.memberNumber;
    byMember.set(key, (byMember.get(key) ?? 0) + 1);
  });
  const avgVisits = byMember.size > 0 ? [...byMember.values()].reduce((s, v) => s + v, 0) / byMember.size : 0;
  const kpis = [
    { label: "Total OPD Visits",   value: rows.length.toLocaleString() },
    { label: "Unique Members",     value: byMember.size.toLocaleString() },
    { label: "Avg Visits / Member",value: avgVisits.toFixed(1) },
    { label: "Total Billed (UGX)", value: totalBilled.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Group", "Provider", "Date", "Category", "Billed (UGX)", "Status"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.member.group.name,
    r.provider.name,
    new Date(r.dateOfService).toLocaleDateString("en-UG"),
    r.benefitCategory.replace(/_/g, " "),
    Number(r.billedAmount).toLocaleString(),
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

// ── TRANCHE 2: Financial ──────────────────────────────────────────────────────

async function getLossRatioData(tenantId: string): Promise<ReportResult> {
  const groups = await prisma.group.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      invoices: { select: { totalAmount: true, paidAmount: true } },
      members: {
        select: {
          claims: {
            where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } },
            select: { approvedAmount: true },
          },
        },
      },
    },
  });

  const rows = groups.map(g => {
    const premium  = g.invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const claims   = g.members.flatMap(m => m.claims).reduce((s, c) => s + Number(c.approvedAmount), 0);
    const lossRatio = premium > 0 ? (claims / premium) * 100 : 0;
    return { id: g.id, name: g.name, premium, claims, lossRatio };
  }).filter(r => r.premium > 0).sort((a, b) => b.lossRatio - a.lossRatio);

  const totalPremium = rows.reduce((s, r) => s + r.premium, 0);
  const totalClaims  = rows.reduce((s, r) => s + r.claims, 0);
  const overallRatio = totalPremium > 0 ? (totalClaims / totalPremium) * 100 : 0;

  const kpis = [
    { label: "Groups",              value: rows.length.toLocaleString() },
    { label: "Total Premium (UGX)", value: totalPremium.toLocaleString() },
    { label: "Total Claims (UGX)",  value: totalClaims.toLocaleString() },
    { label: "Overall Loss Ratio",  value: `${overallRatio.toFixed(1)}%` },
  ];
  const headers = ["Group", "Premium Collected (UGX)", "Claims Approved (UGX)", "Loss Ratio %", "Rating"];
  const data: Cell[][] = rows.map(r => [
    { text: r.name, href: `/analytics/schemes/${r.id}?from=report` },
    r.premium.toLocaleString(),
    r.claims.toLocaleString(),
    `${r.lossRatio.toFixed(1)}%`,
    r.lossRatio > 100 ? "LOSS" : r.lossRatio > 80 ? "HIGH" : r.lossRatio > 60 ? "MODERATE" : "PROFITABLE",
  ]);
  return { kpis, headers, data };
}

async function getClaimsExperienceData(tenantId: string): Promise<ReportResult> {
  const claims = await prisma.claim.findMany({
    where: { tenantId },
    select: {
      billedAmount: true, approvedAmount: true, status: true,
      benefitCategory: true, serviceType: true,
      member: { select: { group: { select: { id: true, name: true } } } },
    },
  });

  // Aggregate by group + category
  const byKey = new Map<string, { groupId: string; group: string; category: string; count: number; billed: number; approved: number; declined: number }>();
  for (const c of claims) {
    const key = `${c.member.group.id}||${c.benefitCategory}`;
    const row = byKey.get(key) ?? { groupId: c.member.group.id, group: c.member.group.name, category: c.benefitCategory, count: 0, billed: 0, approved: 0, declined: 0 };
    row.count++;
    row.billed   += Number(c.billedAmount);
    row.approved += Number(c.approvedAmount);
    if (["DECLINED", "VOID"].includes(c.status)) row.declined++;
    byKey.set(key, row);
  }
  const rows = [...byKey.values()].sort((a, b) => b.billed - a.billed);

  const kpis = [
    { label: "Groups × Categories",  value: rows.length.toLocaleString() },
    { label: "Total Billed (UGX)",   value: rows.reduce((s, r) => s + r.billed, 0).toLocaleString() },
    { label: "Total Approved (UGX)", value: rows.reduce((s, r) => s + r.approved, 0).toLocaleString() },
    { label: "Total Declined",       value: rows.reduce((s, r) => s + r.declined, 0).toLocaleString() },
  ];
  const headers = ["Group", "Benefit Category", "Claims", "Billed (UGX)", "Approved (UGX)", "Declined", "Approval Rate %"];
  const data: Cell[][] = rows.map(r => [
    { text: r.group, href: `/analytics/schemes/${r.groupId}?from=report` },
    r.category.replace(/_/g, " "),
    r.count.toString(),
    r.billed.toLocaleString(),
    r.approved.toLocaleString(),
    r.declined.toString(),
    r.count > 0 ? `${(((r.count - r.declined) / r.count) * 100).toFixed(1)}%` : "—",
  ]);
  return { kpis, headers, data };
}

async function getAgeingAnalysisData(tenantId: string) {
  const today = new Date();
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, balance: { gt: 0 }, status: { notIn: ["VOID", "PAID"] } },
    select: {
      invoiceNumber: true, dueDate: true, balance: true, status: true,
      group: { select: { name: true } },
    },
  });

  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "91+": 0 };
  const bucketed = invoices.map(inv => {
    const days = Math.max(0, Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
    const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "91+";
    buckets[bucket] += Number(inv.balance);
    return { ...inv, days, bucket };
  }).sort((a, b) => b.days - a.days);

  const kpis = [
    { label: "0-30 Days (UGX)",  value: buckets["0-30"].toLocaleString() },
    { label: "31-60 Days (UGX)", value: buckets["31-60"].toLocaleString() },
    { label: "61-90 Days (UGX)", value: buckets["61-90"].toLocaleString() },
    { label: "91+ Days (UGX)",   value: buckets["91+"].toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Due Date", "Days Overdue", "Balance (UGX)", "Bucket", "Status"];
  const data = bucketed.map(r => [
    r.invoiceNumber,
    r.group.name,
    new Date(r.dueDate).toLocaleDateString("en-UG"),
    r.days.toString(),
    Number(r.balance).toLocaleString(),
    r.bucket,
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

async function getCommissionStatementsData(tenantId: string) {
  const rows = await prisma.commission.findMany({
    where: { broker: { tenantId } },
    select: {
      period: true, commissionRate: true, commissionAmount: true,
      paymentStatus: true, paidAt: true, createdAt: true,
      broker: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const totalEarned = rows.reduce((s, r) => s + Number(r.commissionAmount), 0);
  const totalPaid   = rows.filter(r => r.paymentStatus === "PAID").reduce((s, r) => s + Number(r.commissionAmount), 0);
  const kpis = [
    { label: "Commission Records",   value: rows.length.toLocaleString() },
    { label: "Total Earned (UGX)",   value: totalEarned.toLocaleString() },
    { label: "Total Paid (UGX)",     value: totalPaid.toLocaleString() },
    { label: "Outstanding (UGX)",    value: (totalEarned - totalPaid).toLocaleString() },
  ];
  const headers = ["Broker", "Period", "Rate %", "Amount (UGX)", "Status", "Earned Date", "Paid Date"];
  const data = rows.map(r => [
    r.broker.name,
    r.period,
    `${Number(r.commissionRate).toFixed(1)}%`,
    Number(r.commissionAmount).toLocaleString(),
    r.paymentStatus,
    new Date(r.createdAt).toLocaleDateString("en-UG"),
    r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-UG") : "—",
  ]);
  return { kpis, headers, data };
}

async function getLeviesTaxesData(tenantId: string) {
  const rows = await prisma.invoice.findMany({
    where: { tenantId },
    select: {
      invoiceNumber: true, period: true, totalAmount: true,
      stampDuty: true, trainingLevy: true, phcf: true, taxTotal: true,
      createdAt: true,
      group: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const totalStamp    = rows.reduce((s, r) => s + Number(r.stampDuty), 0);
  const totalLevy     = rows.reduce((s, r) => s + Number(r.trainingLevy), 0);
  const totalPhcf     = rows.reduce((s, r) => s + Number(r.phcf), 0);
  const totalTax      = rows.reduce((s, r) => s + Number(r.taxTotal), 0);
  const kpis = [
    { label: "Stamp Duty (UGX)",      value: totalStamp.toLocaleString() },
    { label: "Training Levy (UGX)",   value: totalLevy.toLocaleString() },
    { label: "PHCF (UGX)",            value: totalPhcf.toLocaleString() },
    { label: "Total Tax Collected",   value: totalTax.toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Total Invoice (UGX)", "Stamp Duty", "Training Levy", "PHCF", "Tax Total"];
  const data = rows.map(r => [
    r.invoiceNumber,
    r.group.name,
    r.period,
    Number(r.totalAmount).toLocaleString(),
    Number(r.stampDuty).toLocaleString(),
    Number(r.trainingLevy).toLocaleString(),
    Number(r.phcf).toLocaleString(),
    Number(r.taxTotal).toLocaleString(),
  ]);
  return { kpis, headers, data };
}

async function getFundUtilisationData(tenantId: string) {
  const accounts = await prisma.selfFundedAccount.findMany({
    where: { tenantId },
    include: {
      group: { select: { name: true } },
      transactions: { orderBy: { postedAt: "desc" }, take: 5 },
    },
  });
  const totalDeposited = accounts.reduce((s, a) => s + Number(a.totalDeposited), 0);
  const totalClaims    = accounts.reduce((s, a) => s + Number(a.totalClaims), 0);
  const totalBalance   = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const kpis = [
    { label: "Self-Funded Schemes",  value: accounts.length.toLocaleString() },
    { label: "Total Deposited (UGX)",value: totalDeposited.toLocaleString() },
    { label: "Claims Deducted (UGX)",value: totalClaims.toLocaleString() },
    { label: "Current Balance (UGX)",value: totalBalance.toLocaleString() },
  ];
  const headers = ["Group", "Current Balance (UGX)", "Total Deposited (UGX)", "Claims Deducted (UGX)", "Admin Fees (UGX)", "Period Start", "Period End"];
  const data = accounts.map(a => [
    a.group.name,
    Number(a.balance).toLocaleString(),
    Number(a.totalDeposited).toLocaleString(),
    Number(a.totalClaims).toLocaleString(),
    Number(a.totalAdminFees).toLocaleString(),
    new Date(a.periodStartDate).toLocaleDateString("en-UG"),
    new Date(a.periodEndDate).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

// ── TRANCHE 3: Analytical ─────────────────────────────────────────────────────

async function getExclusionRejectedData(tenantId: string) {
  // NW-D03: line-aware — includes excluded/declined lines inside approved &
  // partially-approved claims, not just wholly-declined claims.
  const rows = await getExclusionRejectionRows(tenantId);
  const byReason = new Map<string, number>();
  rows.forEach(r => {
    const reason = r.reason?.split(" — ")[0] || "OTHER";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  });
  const topReason = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];
  const kpis = [
    { label: "Total Excluded/Declined", value: rows.length.toLocaleString() },
    { label: "Total Disallowed (UGX)",  value: rows.reduce((s, r) => s + r.disallowed, 0).toLocaleString() },
    { label: "Top Decline Reason",      value: topReason ? `${topReason[0]} (${topReason[1]})` : "—" },
    { label: "Unique Reason Codes",     value: byReason.size.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Provider", "Category", "Item", "Status", "Reason", "Disallowed (UGX)", "Decided"];
  const data = rows.map(r => [
    r.claimNumber,
    r.member,
    r.provider,
    r.category,
    r.scope,
    r.status,
    r.reason,
    r.disallowed.toLocaleString(),
    r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("en-UG") : "—",
  ]);
  return { kpis, headers, data };
}

async function getClaimsPerOperatorData(tenantId: string) {
  const [logs, users] = await Promise.all([
    prisma.adjudicationLog.findMany({
      where: { claim: { tenantId }, action: { in: ["APPROVED", "PARTIALLY_APPROVED", "DECLINED"] } },
      select: { action: true, amount: true, userId: true },
    }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, firstName: true, lastName: true, role: true } }),
  ]);
  const userMap = new Map(users.map(u => [u.id, u]));

  const byUser = new Map<string, { name: string; role: string; approved: number; declined: number; total: number; totalKES: number }>();
  for (const l of logs) {
    const u = userMap.get(l.userId);
    const name = u ? `${u.firstName} ${u.lastName}` : "Unknown";
    const role = u?.role ?? "—";
    const row = byUser.get(l.userId) ?? { name, role, approved: 0, declined: 0, total: 0, totalKES: 0 };
    row.total++;
    row.totalKES += Number(l.amount ?? 0);
    if (["APPROVED", "PARTIALLY_APPROVED"].includes(l.action)) row.approved++;
    if (l.action === "DECLINED") row.declined++;
    byUser.set(l.userId, row);
  }
  const rows = [...byUser.values()].sort((a, b) => b.total - a.total);

  const kpis = [
    { label: "Active Operators",    value: rows.length.toLocaleString() },
    { label: "Total Decisions",     value: rows.reduce((s, r) => s + r.total, 0).toLocaleString() },
    { label: "Total Approved (UGX)",value: rows.reduce((s, r) => s + r.totalKES, 0).toLocaleString() },
    { label: "Most Active",         value: rows[0]?.name ?? "—" },
  ];
  const headers = ["Operator", "Role", "Total Decisions", "Approved", "Declined", "Approval Rate %", "Total Approved (UGX)"];
  const data = rows.map(r => [
    r.name,
    r.role.replace(/_/g, " "),
    r.total.toString(),
    r.approved.toString(),
    r.declined.toString(),
    r.total > 0 ? `${((r.approved / r.total) * 100).toFixed(1)}%` : "—",
    r.totalKES.toLocaleString(),
  ]);
  return { kpis, headers, data };
}

async function getUserRightsRolesData(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: {
      firstName: true, lastName: true, email: true, role: true,
      isActive: true, lastLoginAt: true, createdAt: true,
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });
  const active  = users.filter(u => u.isActive).length;
  const byRole  = new Map<string, number>();
  users.forEach(u => byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1));
  const kpis = [
    { label: "Total Users",  value: users.length.toLocaleString() },
    { label: "Active Users", value: active.toLocaleString() },
    { label: "Roles in Use", value: byRole.size.toLocaleString() },
    { label: "Inactive",     value: (users.length - active).toLocaleString() },
  ];
  const headers = ["Name", "Email", "Role", "Active", "Last Login", "Created"];
  const data = users.map(u => [
    `${u.firstName} ${u.lastName}`,
    u.email,
    u.role.replace(/_/g, " "),
    u.isActive ? "Yes" : "No",
    u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-UG") : "Never",
    new Date(u.createdAt).toLocaleDateString("en-UG"),
  ]);
  return { kpis, headers, data };
}

// ── Strategic Analytics Fetchers ─────────────────────────────────────────────

async function getAnalyticsPortfolioMlrData(tenantId: string, scope?: AnalyticsAccessScope): Promise<ReportResult> {
  const [snapshots, alerts] = await Promise.all([
    prisma.analyticsMlrSnapshot.findMany({
      where: { tenantId, grain: "SCHEME", ...reportGroupIdWhere(scope) },
      orderBy: [{ periodStart: "desc" }],
      distinct: ["groupId"],
      select: {
        groupId: true, period: true,
        grossContribution: true, benefitPaid: true, memberCoContribution: true,
        mlr: true, trailing12Mlr: true,
      },
    }),
    prisma.analyticsAlert.groupBy({
      by: ["groupId"],
      where: { tenantId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, groupId: { not: null }, ...reportGroupIdWhere(scope) },
      _count: { id: true },
    }),
  ]);

  const groupIds = snapshots.map(s => s.groupId).filter(Boolean) as string[];
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true },
  });
  const groupNameById = new Map(groups.map(g => [g.id, g.name]));
  const alertCountByGroup = new Map(alerts.map(a => [a.groupId, a._count.id]));

  const rows = snapshots
    .map(s => ({
      groupId: s.groupId ?? "",
      name: groupNameById.get(s.groupId ?? "") ?? "Unknown",
      period: s.period,
      contribution: Number(s.grossContribution),
      claims: Number(s.benefitPaid) + Number(s.memberCoContribution),
      mlr: Number(s.mlr),
      trailing12Mlr: Number(s.trailing12Mlr),
      alerts: alertCountByGroup.get(s.groupId) ?? 0,
    }))
    .filter(r => r.groupId)
    .sort((a, b) => b.mlr - a.mlr);

  const kpis = [
    { label: "Schemes",             value: rows.length.toLocaleString() },
    { label: "Avg Portfolio MLR",   value: rows.length > 0 ? `${(rows.reduce((s, r) => s + r.mlr, 0) / rows.length * 100).toFixed(1)}%` : "—" },
    { label: "Schemes >80% MLR",    value: rows.filter(r => r.mlr > 0.8).length.toLocaleString() },
    { label: "Open Alerts",         value: rows.reduce((s, r) => s + r.alerts, 0).toLocaleString() },
  ];
  const headers = ["Scheme", "Period", "Contribution (UGX)", "Claims (UGX)", "MLR %", "Trailing 12M MLR", "Open Alerts"];
  const data: Cell[][] = rows.map(r => [
    { text: r.name, href: `/analytics/schemes/${r.groupId}?from=report` },
    r.period,
    r.contribution.toLocaleString(),
    r.claims.toLocaleString(),
    `${(r.mlr * 100).toFixed(1)}%`,
    `${(r.trailing12Mlr * 100).toFixed(1)}%`,
    r.alerts.toString(),
  ]);
  return { kpis, headers, data };
}

async function getAnalyticsSchemeProfitabilityData(tenantId: string, scope?: AnalyticsAccessScope): Promise<ReportResult> {
  const groups = await prisma.group.findMany({
    where: { tenantId, ...reportGroupWhere(scope) },
    select: { id: true, name: true, renewalDate: true },
  });

  const snapshots = await prisma.analyticsMlrSnapshot.findMany({
    where: { tenantId, grain: "SCHEME", ...reportGroupIdWhere(scope) },
    orderBy: [{ periodStart: "desc" }],
    distinct: ["groupId"],
    select: {
      groupId: true, period: true,
      grossContribution: true, paidContribution: true,
      benefitPaid: true, memberCoContribution: true, grossCost: true,
      mlr: true, trailing12Mlr: true,
    },
  });

  const snapshotByGroup = new Map(snapshots.map(s => [s.groupId, s]));
  const groupNameById = new Map(groups.map(g => [g.id, g.name]));

  const rows = snapshots
    .map(s => {
      const name = groupNameById.get(s.groupId ?? "") ?? "Unknown";
      const contribution = Number(s.grossContribution);
      const claims = Number(s.benefitPaid) + Number(s.memberCoContribution);
      const surplus = contribution - claims;
      return {
        groupId: s.groupId ?? "",
        name,
        period: s.period,
        contribution,
        claims,
        surplus,
        mlr: Number(s.mlr),
        trailing12Mlr: Number(s.trailing12Mlr),
      };
    })
    .filter(r => r.groupId)
    .sort((a, b) => b.mlr - a.mlr);

  const kpis = [
    { label: "Schemes",              value: rows.length.toLocaleString() },
    { label: "Total Contribution",   value: `UGX ${(rows.reduce((s, r) => s + r.contribution, 0) / 1_000_000).toFixed(1)}M` },
    { label: "Total Claims",         value: `UGX ${(rows.reduce((s, r) => s + r.claims, 0) / 1_000_000).toFixed(1)}M` },
    { label: "Net Surplus",          value: `UGX ${(rows.reduce((s, r) => s + r.surplus, 0) / 1_000_000).toFixed(1)}M` },
  ];
  const headers = ["Scheme", "Period", "Contribution (UGX)", "Claims (UGX)", "Surplus/Deficit (UGX)", "MLR %", "Trailing 12M MLR", "Status"];
  const data: Cell[][] = rows.map(r => [
    { text: r.name, href: `/analytics/schemes/${r.groupId}?from=report` },
    r.period,
    r.contribution.toLocaleString(),
    r.claims.toLocaleString(),
    r.surplus.toLocaleString(),
    `${(r.mlr * 100).toFixed(1)}%`,
    `${(r.trailing12Mlr * 100).toFixed(1)}%`,
    r.mlr > 1 ? "LOSS" : r.mlr > 0.8 ? "HIGH" : r.mlr > 0.6 ? "MODERATE" : "PROFITABLE",
  ]);
  return { kpis, headers, data };
}

async function getAnalyticsProviderPerformanceData(tenantId: string, scope?: AnalyticsAccessScope): Promise<ReportResult> {
  const scopedProviderRows = scope?.allowedGroupIds || scope?.groupId || scope?.noAccess
    ? await prisma.analyticsEncounterFact.findMany({
        where: { tenantId, ...reportGroupIdWhere(scope) },
        distinct: ["providerId"],
        select: { providerId: true },
      })
    : null;
  const providerIds = scopedProviderRows?.map(row => row.providerId);
  const latest = await prisma.providerScorecard.findFirst({
    where: { tenantId, ...(providerIds ? { providerId: { in: providerIds } } : {}) },
    orderBy: { periodStart: "desc" },
    select: { period: true },
  });

  if (!latest) {
    return {
      kpis: [{ label: "Status", value: "No scorecard data" }],
      headers: ["Provider", "Period", "Claims", "Members", "Adjusted Cost (UGX)", "Avg Cost (UGX)", "CMI", "Rejection Rate"],
      data: [],
    };
  }

  const scorecards = await prisma.providerScorecard.findMany({
    where: { tenantId, period: latest.period, ...(providerIds ? { providerId: { in: providerIds } } : {}) },
    orderBy: { adjustedCost: "desc" },
  });

  const kpis = [
    { label: "Providers Ranked",    value: scorecards.length.toLocaleString() },
    { label: "Period",              value: latest.period },
    { label: "Total Adjusted Cost", value: `UGX ${(scorecards.reduce((s, r) => s + Number(r.adjustedCost), 0) / 1_000_000).toFixed(1)}M` },
    { label: "Avg CMI",             value: (scorecards.reduce((s, r) => s + Number(r.caseMixIndex), 0) / Math.max(1, scorecards.length)).toFixed(2) },
  ];
  const headers = ["Provider", "Tier", "Period", "Claims", "Members", "Adjusted Cost (UGX)", "Avg Cost (UGX)", "CMI", "Rejection Rate %"];
  const data: Cell[][] = scorecards.map(r => [
    { text: r.providerName, href: `/analytics/providers/${r.providerId}?from=report` },
    r.providerTier ?? "UNKNOWN",
    r.period,
    r.claimCount.toString(),
    r.memberCount.toString(),
    Number(r.adjustedCost).toLocaleString(),
    Number(r.averageCost).toLocaleString(),
    Number(r.caseMixIndex).toFixed(2),
    `${(Number(r.rejectionRate) * 100).toFixed(1)}%`,
  ]);
  return { kpis, headers, data };
}

async function getAnalyticsRenewalRecommendationsData(tenantId: string, scope?: AnalyticsAccessScope): Promise<ReportResult> {
  const analyses = await prisma.renewalAnalysis.findMany({
    where: { tenantId, ...reportGroupIdWhere(scope) },
    orderBy: { renewalDate: "asc" },
  });

  const groupIds = analyses.map(a => a.groupId);
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true, name: true,
      broker: { select: { name: true } },
      _count: { select: { members: { where: { status: "ACTIVE" } } } },
    },
  });
  const groupById = new Map(groups.map(g => [g.id, g]));

  const now = new Date();
  const rows = analyses.map(a => {
    const group = groupById.get(a.groupId);
    const daysToRenewal = Math.ceil((new Date(a.renewalDate).getTime() - now.getTime()) / 86400000);
    return {
      groupId: a.groupId,
      name: group?.name ?? "Unknown",
      intermediary: group?.broker?.name ?? "Direct",
      activeMembers: group?._count.members ?? 0,
      renewalDate: new Date(a.renewalDate).toLocaleDateString("en-UG"),
      daysToRenewal,
      trailing12Mlr: Number(a.trailing12Mlr),
      targetMlr: Number(a.targetMlr),
      recommendedContribution: Number(a.recommendedContribution),
      recommendedAdjustmentPct: Number(a.recommendedAdjustmentPct),
    };
  });

  const due90 = rows.filter(r => r.daysToRenewal <= 90 && r.daysToRenewal >= 0).length;
  const kpis = [
    { label: "Total Analyses",     value: rows.length.toLocaleString() },
    { label: "Due in 90 Days",     value: due90.toLocaleString() },
    { label: "Avg Trailing MLR",   value: rows.length > 0 ? `${(rows.reduce((s, r) => s + r.trailing12Mlr, 0) / rows.length * 100).toFixed(1)}%` : "—" },
    { label: "Avg Adjustment",     value: rows.length > 0 ? `${(rows.reduce((s, r) => s + r.recommendedAdjustmentPct, 0) / rows.length * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Scheme", "Intermediary", "Members", "Renewal Date", "Days", "Trailing MLR", "Target MLR", "Recommended Contribution", "Adjustment %"];
  const data: Cell[][] = rows.map(r => [
    { text: r.name, href: `/analytics/renewals/${r.groupId}?from=report` },
    r.intermediary,
    r.activeMembers.toString(),
    r.renewalDate,
    r.daysToRenewal.toString(),
    `${(r.trailing12Mlr * 100).toFixed(1)}%`,
    `${(r.targetMlr * 100).toFixed(1)}%`,
    `UGX ${r.recommendedContribution.toLocaleString()}`,
    `${(r.recommendedAdjustmentPct * 100).toFixed(1)}%`,
  ]);
  return { kpis, headers, data };
}

async function getAnalyticsRiskDistributionData(tenantId: string, scope?: AnalyticsAccessScope): Promise<ReportResult> {
  const profiles = await prisma.memberRiskProfile.groupBy({
    by: ["groupId", "riskTier"],
    where: { tenantId, ...reportGroupIdWhere(scope) },
    _count: { id: true },
    _avg: { riskScore: true, utilizationToCap: true },
  });

  const groupIds = [...new Set(profiles.map(p => p.groupId))];
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true },
  });
  const groupNameById = new Map(groups.map(g => [g.id, g.name]));

  const totalByGroup = new Map<string, number>();
  for (const p of profiles) {
    totalByGroup.set(p.groupId, (totalByGroup.get(p.groupId) ?? 0) + p._count.id);
  }

  const rows = profiles
    .map(p => ({
      groupId: p.groupId,
      groupName: groupNameById.get(p.groupId) ?? "Unknown",
      riskTier: p.riskTier,
      count: p._count.id,
      total: totalByGroup.get(p.groupId) ?? 1,
      avgScore: Number(p._avg.riskScore ?? 0),
      avgUtilization: Number(p._avg.utilizationToCap ?? 0),
    }))
    .sort((a, b) => {
      const tierOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
      return (tierOrder[a.riskTier] ?? 4) - (tierOrder[b.riskTier] ?? 4) || a.groupName.localeCompare(b.groupName);
    });

  const totalMembers = new Set(profiles.map(p => p.groupId + p.riskTier)).size;
  const critical = profiles.filter(p => p.riskTier === "CRITICAL").reduce((s, p) => s + p._count.id, 0);
  const high = profiles.filter(p => p.riskTier === "HIGH").reduce((s, p) => s + p._count.id, 0);
  const kpis = [
    { label: "Profiled Members",   value: profiles.reduce((s, p) => s + p._count.id, 0).toLocaleString() },
    { label: "Critical Risk",      value: critical.toLocaleString() },
    { label: "High Risk",          value: high.toLocaleString() },
    { label: "Groups Covered",     value: groupIds.length.toLocaleString() },
  ];
  const headers = ["Scheme", "Risk Tier", "Members", "% of Scheme", "Avg Risk Score", "Avg Utilization %"];
  const data: Cell[][] = rows.map(r => [
    { text: r.groupName, href: `/analytics/schemes/${r.groupId}?from=report` },
    r.riskTier,
    r.count.toString(),
    `${((r.count / r.total) * 100).toFixed(1)}%`,
    r.avgScore.toFixed(2),
    `${(r.avgUtilization * 100).toFixed(1)}%`,
  ]);
  return { kpis, headers, data };
}

// ── R-10: Debtors & Creditors ─────────────────────────────────────────────────
async function getDebtorsCreditorsData(tenantId: string): Promise<ReportResult> {
  const now = new Date();

  // Debtors: unpaid invoice balances per group, bucketed by days overdue
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, balance: { gt: 0 } },
    select: {
      balance: true, dueDate: true, invoiceNumber: true,
      group: { select: { name: true } },
    },
  });

  const bucket = (due: Date) => {
    const d = Math.ceil((now.getTime() - due.getTime()) / 864e5);
    if (d <= 0)  return "Current";
    if (d <= 30) return "1–30 days";
    if (d <= 60) return "31–60 days";
    if (d <= 90) return "61–90 days";
    return "91+ days";
  };

  const debtorRows = invoices.map(i => [
    i.invoiceNumber,
    i.group.name,
    `UGX ${Number(i.balance).toLocaleString("en-UG")}`,
    bucket(i.dueDate),
    new Date(i.dueDate).toLocaleDateString("en-UG"),
  ]);

  // Creditors: approved claims not yet in a settled batch (payable to providers)
  const unsettledClaims = await prisma.claim.findMany({
    where: { tenantId, status: { in: ["APPROVED", "PARTIALLY_APPROVED"] }, settlementBatchId: null },
    select: {
      claimNumber: true, approvedAmount: true,
      provider: { select: { name: true } },
      decidedAt: true,
    },
  });

  const creditorRows = unsettledClaims.map(c => [
    c.claimNumber,
    c.provider.name,
    `UGX ${Number(c.approvedAmount ?? 0).toLocaleString("en-UG")}`,
    "Provider Payable",
    c.decidedAt ? new Date(c.decidedAt).toLocaleDateString("en-UG") : "—",
  ]);

  const totalDebtors   = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const totalCreditors = unsettledClaims.reduce((s, c) => s + Number(c.approvedAmount ?? 0), 0);

  return {
    kpis: [
      { label: "Total Receivables (UGX)", value: totalDebtors.toLocaleString("en-UG") },
      { label: "Total Payables (UGX)",    value: totalCreditors.toLocaleString("en-UG") },
      { label: "Net Position (UGX)",      value: (totalDebtors - totalCreditors).toLocaleString("en-UG") },
      { label: "Unsettled Claim Batches", value: unsettledClaims.length.toString() },
    ],
    headers: ["Reference", "Counterparty", "Amount (UGX)", "Type / Age Bucket", "Date"],
    data: [...debtorRows, ...creditorRows],
  };
}

// ── R-12: Fees Statement ──────────────────────────────────────────────────────
async function getFeesStatementData(tenantId: string): Promise<ReportResult> {
  // Card issuance fees — from MembershipCard records that have a replacementFeeInvoiceId
  const cardFeeInvoices = await prisma.invoice.findMany({
    where: { tenantId, notes: { contains: "Card" } },
    select: { invoiceNumber: true, totalAmount: true, createdAt: true, group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Reinstatement fees — invoices with "Reinstate" in notes
  const reinstateFeeInvoices = await prisma.invoice.findMany({
    where: { tenantId, notes: { contains: "Reinstate" } },
    select: { invoiceNumber: true, totalAmount: true, createdAt: true, group: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const cardRows = cardFeeInvoices.map(i => [
    i.invoiceNumber, i.group.name, "Card Issuance",
    `UGX ${Number(i.totalAmount).toLocaleString("en-UG")}`,
    new Date(i.createdAt).toLocaleDateString("en-UG"),
  ]);
  const reinstateRows = reinstateFeeInvoices.map(i => [
    i.invoiceNumber, i.group.name, "Reinstatement",
    `UGX ${Number(i.totalAmount).toLocaleString("en-UG")}`,
    new Date(i.createdAt).toLocaleDateString("en-UG"),
  ]);

  const all = [...cardRows, ...reinstateRows];
  const total = [...cardFeeInvoices, ...reinstateFeeInvoices].reduce((s, i) => s + Number(i.totalAmount), 0);

  return {
    kpis: [
      { label: "Card Fees",          value: `UGX ${cardFeeInvoices.reduce((s, i) => s + Number(i.totalAmount), 0).toLocaleString("en-UG")}` },
      { label: "Reinstatement Fees", value: `UGX ${reinstateFeeInvoices.reduce((s, i) => s + Number(i.totalAmount), 0).toLocaleString("en-UG")}` },
      { label: "Total Fees",         value: `UGX ${total.toLocaleString("en-UG")}` },
      { label: "Records",            value: all.length.toString() },
    ],
    headers: ["Invoice No.", "Scheme", "Fee Type", "Amount (UGX)", "Date"],
    data: all,
  };
}

// ── R-15: Admin Fee Statement (self-funded) ───────────────────────────────────
async function getAdminFeeData(tenantId: string): Promise<ReportResult> {
  const feeTransactions = await prisma.fundTransaction.findMany({
    where: { tenantId, type: "ADMIN_FEE" },
    select: {
      id: true, amount: true, postedAt: true, description: true,
      selfFundedAccount: {
        select: { group: { select: { name: true, adminFeeMethod: true, adminFeeRate: true } } },
      },
    },
    orderBy: { postedAt: "desc" },
    take: 200,
  });

  const total = feeTransactions.reduce((s, t) => s + Number(t.amount), 0);

  return {
    kpis: [
      { label: "Admin Fee Transactions", value: feeTransactions.length.toString() },
      { label: "Total Admin Fees (UGX)", value: `UGX ${total.toLocaleString("en-UG")}` },
      { label: "Self-Funded Schemes",    value: new Set(feeTransactions.map(t => t.selfFundedAccount.group.name)).size.toString() },
      { label: "Avg Fee (UGX)",          value: feeTransactions.length > 0 ? `UGX ${(total / feeTransactions.length).toLocaleString("en-UG")}` : "—" },
    ],
    headers: ["Scheme", "Calc Method", "Fee Rate", "Amount (UGX)", "Date", "Description"],
    data: feeTransactions.map(t => [
      t.selfFundedAccount.group.name,
      t.selfFundedAccount.group.adminFeeMethod ?? "—",
      t.selfFundedAccount.group.adminFeeRate ? `${Number(t.selfFundedAccount.group.adminFeeRate)}` : "—",
      `UGX ${Number(t.amount).toLocaleString("en-UG")}`,
      new Date(t.postedAt).toLocaleDateString("en-UG"),
      t.description ?? "—",
    ]),
  };
}

// ── R-17: Organic Growth ──────────────────────────────────────────────────────
async function getOrganicGrowthData(tenantId: string): Promise<ReportResult> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [newMembers, lapses, cancellations] = await Promise.all([
    prisma.member.groupBy({
      by: ["enrollmentDate"],
      where: { tenantId, enrollmentDate: { gte: twelveMonthsAgo } },
      _count: { _all: true },
    }),
    prisma.membershipLapseRecord.groupBy({
      by: ["lapseDate"],
      where: { tenantId, lapseDate: { gte: twelveMonthsAgo } },
      _count: { _all: true },
    }),
    prisma.membershipCancellationRecord.groupBy({
      by: ["effectiveDate"],
      where: { tenantId, effectiveDate: { gte: twelveMonthsAgo } },
      _count: { _all: true },
    }),
  ]);

  // Aggregate by month
  const byMonth: Record<string, { month: string; newCount: number; lapsed: number; cancelled: number }> = {};
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (k: string) => new Date(k + "-01").toLocaleDateString("en-UG", { month: "short", year: "numeric" });

  for (const r of newMembers) {
    const k = monthKey(new Date(r.enrollmentDate));
    if (!byMonth[k]) byMonth[k] = { month: monthLabel(k), newCount: 0, lapsed: 0, cancelled: 0 };
    byMonth[k].newCount += r._count._all;
  }
  for (const r of lapses) {
    const k = monthKey(new Date(r.lapseDate));
    if (!byMonth[k]) byMonth[k] = { month: monthLabel(k), newCount: 0, lapsed: 0, cancelled: 0 };
    byMonth[k].lapsed += r._count._all;
  }
  for (const r of cancellations) {
    const k = monthKey(new Date(r.effectiveDate));
    if (!byMonth[k]) byMonth[k] = { month: monthLabel(k), newCount: 0, lapsed: 0, cancelled: 0 };
    byMonth[k].cancelled += r._count._all;
  }

  const rows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => [
      v.month,
      v.newCount.toString(),
      v.lapsed.toString(),
      v.cancelled.toString(),
      (v.newCount - v.lapsed - v.cancelled).toString(),
    ]);

  const totalNew       = newMembers.reduce((s, r) => s + r._count._all, 0);
  const totalLapsed    = lapses.reduce((s, r) => s + r._count._all, 0);
  const totalCancelled = cancellations.reduce((s, r) => s + r._count._all, 0);

  return {
    kpis: [
      { label: "New Enrolments (12m)",  value: totalNew.toString() },
      { label: "Lapses (12m)",          value: totalLapsed.toString() },
      { label: "Cancellations (12m)",   value: totalCancelled.toString() },
      { label: "Net Growth (12m)",      value: (totalNew - totalLapsed - totalCancelled).toString() },
    ],
    headers: ["Month", "New Enrolments", "Lapses", "Cancellations", "Net Growth"],
    data: rows,
  };
}

// ── R-22: Service Cost Comparison ─────────────────────────────────────────────
async function getComparisonServicesData(tenantId: string): Promise<ReportResult> {
  // Group claim lines by CPT code to compare contracted vs billed vs approved
  const lines = await prisma.claimLine.findMany({
    where: { claim: { tenantId } },
    select: {
      cptCode: true, description: true,
      billedAmount: true, approvedAmount: true, tariffRate: true,
    },
    take: 2000,
  });

  const byCpt: Record<string, { desc: string; billed: number[]; approved: number[]; tariff: number[] }> = {};
  for (const l of lines) {
    const code = l.cptCode ?? "UNCODED";
    if (!byCpt[code]) byCpt[code] = { desc: l.description, billed: [], approved: [], tariff: [] };
    byCpt[code].billed.push(Number(l.billedAmount));
    if (l.approvedAmount) byCpt[code].approved.push(Number(l.approvedAmount));
    if (l.tariffRate) byCpt[code].tariff.push(Number(l.tariffRate));
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const rows = Object.entries(byCpt)
    .map(([code, v]) => {
      const avgBilled    = avg(v.billed);
      const avgApproved  = avg(v.approved);
      const avgContracted = avg(v.tariff);
      const variance = avgContracted > 0 ? ((avgBilled - avgContracted) / avgContracted * 100).toFixed(1) + "%" : "—";
      return [
        code, v.desc.slice(0, 60),
        `UGX ${avgContracted > 0 ? Math.round(avgContracted).toLocaleString("en-UG") : "—"}`,
        `UGX ${Math.round(avgBilled).toLocaleString("en-UG")}`,
        `UGX ${avgApproved > 0 ? Math.round(avgApproved).toLocaleString("en-UG") : "—"}`,
        variance,
        v.billed.length.toString(),
      ];
    })
    .sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

  return {
    kpis: [
      { label: "Distinct CPT Codes",   value: Object.keys(byCpt).length.toString() },
      { label: "Total Claim Lines",    value: lines.length.toString() },
      { label: "Lines with Tariff",    value: lines.filter(l => l.tariffRate).length.toString() },
      { label: "Lines without Tariff", value: lines.filter(l => !l.tariffRate).length.toString() },
    ],
    headers: ["CPT Code", "Description", "Contracted (avg)", "Billed (avg)", "Approved (avg)", "Billed vs Contracted", "Occurrences"],
    data: rows,
  };
}

// ── R-23: Quotation Funnel ────────────────────────────────────────────────────
async function getQuotationFunnelData(tenantId: string): Promise<ReportResult> {
  const quotations = await prisma.quotation.findMany({
    where: { tenantId },
    select: {
      quoteNumber: true, status: true, clientType: true, memberCount: true,
      finalPremium: true, createdAt: true, isRenewal: true,
      broker: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const byStatus: Record<string, number> = {};
  for (const q of quotations) {
    byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
  }

  const total      = quotations.length;
  const accepted   = byStatus["ACCEPTED"] ?? 0;
  const convRate   = total > 0 ? ((accepted / total) * 100).toFixed(1) + "%" : "—";
  const totalValue = quotations.filter(q => q.finalPremium).reduce((s, q) => s + Number(q.finalPremium), 0);

  return {
    kpis: [
      { label: "Total Quotations",   value: total.toString() },
      { label: "Accepted",           value: accepted.toString() },
      { label: "Conversion Rate",    value: convRate },
      { label: "Pipeline Value (UGX)", value: `UGX ${Math.round(totalValue).toLocaleString("en-UG")}` },
    ],
    headers: ["Quote No.", "Status", "Client Type", "Lives", "Premium (UGX)", "Renewal", "Broker", "Date"],
    data: quotations.map(q => [
      q.quoteNumber,
      q.status.replace(/_/g, " "),
      q.clientType ?? "—",
      q.memberCount.toString(),
      q.finalPremium ? `UGX ${Number(q.finalPremium).toLocaleString("en-UG")}` : "—",
      q.isRenewal ? "Yes" : "No",
      q.broker?.name ?? "Direct",
      new Date(q.createdAt).toLocaleDateString("en-UG"),
    ]),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportType: string }>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const analyticsScope = await getAnalyticsAccessScope(session);
  const { reportType } = await params;
  const tenantId = session.user.tenantId;
  const title = REPORT_TITLES[reportType] ?? "Report";

  let kpis: { label: string; value: string }[] = [];
  let headers: string[] = [];
  let data: Cell[][] = [];

  if (reportType === "claims")                   ({ kpis, headers, data } = await getClaimsData(tenantId));
  else if (reportType === "membership")          ({ kpis, headers, data } = await getMembershipData(tenantId));
  else if (reportType === "preauth")             ({ kpis, headers, data } = await getPreauthData(tenantId));
  else if (reportType === "billing")             ({ kpis, headers, data } = await getBillingData(tenantId));
  else if (reportType === "utilization")         ({ kpis, headers, data } = await getUtilizationData(tenantId));
  else if (reportType === "endorsements")        ({ kpis, headers, data } = await getEndorsementsData(tenantId));
  else if (reportType === "quotations")          ({ kpis, headers, data } = await getQuotationsData(tenantId));
  else if (reportType === "chronic-disease")     ({ kpis, headers, data } = await getChronicDiseaseData(tenantId));
  // Tranche 1
  else if (reportType === "outstanding-bills")   ({ kpis, headers, data } = await getOutstandingBillsData(tenantId));
  else if (reportType === "provider-statements") ({ kpis, headers, data } = await getProviderStatementsData(tenantId));
  else if (reportType === "member-statements")   ({ kpis, headers, data } = await getMemberStatementsData(tenantId));
  else if (reportType === "exceeded-limits")     ({ kpis, headers, data } = await getExceededLimitsData(tenantId));
  else if (reportType === "admissions")          ({ kpis, headers, data } = await getAdmissionsData(tenantId));
  else if (reportType === "admission-visits")    ({ kpis, headers, data } = await getAdmissionVisitsData(tenantId));
  // Tranche 2
  else if (reportType === "debtors-creditors")   ({ kpis, headers, data } = await getDebtorsCreditorsData(tenantId));
  else if (reportType === "fees-statements")     ({ kpis, headers, data } = await getFeesStatementData(tenantId));
  else if (reportType === "admin-fee")           ({ kpis, headers, data } = await getAdminFeeData(tenantId));
  else if (reportType === "loss-ratio")          ({ kpis, headers, data } = await getLossRatioData(tenantId));
  else if (reportType === "claims-experience")   ({ kpis, headers, data } = await getClaimsExperienceData(tenantId));
  else if (reportType === "ageing-analysis")     ({ kpis, headers, data } = await getAgeingAnalysisData(tenantId));
  else if (reportType === "commission-statements")({ kpis, headers, data } = await getCommissionStatementsData(tenantId));
  else if (reportType === "levies-taxes")        ({ kpis, headers, data } = await getLeviesTaxesData(tenantId));
  else if (reportType === "fund-utilisation")    ({ kpis, headers, data } = await getFundUtilisationData(tenantId));
  // Tranche 3
  else if (reportType === "organic-growth")      ({ kpis, headers, data } = await getOrganicGrowthData(tenantId));
  else if (reportType === "comparison-services") ({ kpis, headers, data } = await getComparisonServicesData(tenantId));
  else if (reportType === "quotation-funnel")    ({ kpis, headers, data } = await getQuotationFunnelData(tenantId));
  else if (reportType === "exclusion-rejected")  ({ kpis, headers, data } = await getExclusionRejectedData(tenantId));
  else if (reportType === "claims-per-operator") ({ kpis, headers, data } = await getClaimsPerOperatorData(tenantId));
  else if (reportType === "user-rights-roles")   ({ kpis, headers, data } = await getUserRightsRolesData(tenantId));
  // Strategic analytics
  else if (reportType === "analytics-portfolio-mlr")           ({ kpis, headers, data } = await getAnalyticsPortfolioMlrData(tenantId, analyticsScope));
  else if (reportType === "analytics-scheme-profitability")    ({ kpis, headers, data } = await getAnalyticsSchemeProfitabilityData(tenantId, analyticsScope));
  else if (reportType === "analytics-provider-performance")    ({ kpis, headers, data } = await getAnalyticsProviderPerformanceData(tenantId, analyticsScope));
  else if (reportType === "analytics-renewal-recommendations") ({ kpis, headers, data } = await getAnalyticsRenewalRecommendationsData(tenantId, analyticsScope));
  else if (reportType === "analytics-risk-distribution")       ({ kpis, headers, data } = await getAnalyticsRiskDistributionData(tenantId, analyticsScope));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{title}</h1>
            <p className="text-brand-text-body text-sm mt-0.5">
              Medvex · {data.length} record{data.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-2">
            <a
              href={`/api/reports/${reportType}/export`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-brand-indigo border border-brand-indigo/30 rounded-full hover:bg-brand-indigo hover:text-white transition-colors"
            >
              <Download size={15} />
              Export CSV
            </a>
            <ExportPDFButton
              title={title}
              kpis={kpis}
              headers={headers}
              rows={data.map((row) => row.map((cell) => (typeof cell === "string" ? cell : cell.text)))}
              filename={`medvex-${reportType}-${new Date().toISOString().split("T")[0]}.pdf`}
              tenant="Medvex"
            />
          </div>
        )}
      </div>

      {/* KPI cards */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-[13px] font-bold uppercase tracking-normal text-brand-text-muted">{k.label}</p>
              <p className="text-2xl font-bold text-brand-indigo mt-1 tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading font-heading">Data</h2>
        </div>
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left font-ui">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#EEEEEE] text-[13px] uppercase tracking-normal text-brand-text-muted">
                  {headers.map(h => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE] text-brand-text-body">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-[#F8F9FA]">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap text-xs">
                        {typeof cell === "object" ? (
                          <Link href={cell.href} className="font-semibold text-brand-indigo hover:underline">
                            {cell.text}
                          </Link>
                        ) : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-brand-text-body text-sm">
            No data found.
          </div>
        )}
      </div>
    </div>
  );
}
