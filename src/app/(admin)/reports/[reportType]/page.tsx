import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

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
};

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
    { label: "Total Billed (KES)",  value: total.toLocaleString() },
    { label: "Total Approved (KES)",value: approved.toLocaleString() },
    { label: "Loss Ratio",          value: total > 0 ? `${((approved / total) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Claim No.", "Member", "Provider", "Category", "Billed (KES)", "Approved (KES)", "Status", "Date"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName}`,
    r.provider.name,
    r.benefitCategory,
    Number(r.billedAmount).toLocaleString(),
    r.approvedAmount ? Number(r.approvedAmount).toLocaleString() : "—",
    r.status.replace(/_/g, " "),
    new Date(r.createdAt).toLocaleDateString("en-KE"),
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
    new Date(r.enrollmentDate).toLocaleDateString("en-KE"),
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
  const headers = ["PA No.", "Member", "Provider", "Category", "Estimated (KES)", "Approved (KES)", "Status", "Date"];
  const data = rows.map(r => [
    r.preauthNumber,
    `${r.member.firstName} ${r.member.lastName}`,
    r.provider.name,
    r.benefitCategory,
    Number(r.estimatedCost).toLocaleString(),
    r.approvedAmount ? Number(r.approvedAmount).toLocaleString() : "—",
    r.status,
    new Date(r.createdAt).toLocaleDateString("en-KE"),
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
    { label: "Total Billed (KES)",  value: totalBilled.toLocaleString() },
    { label: "Collected (KES)",     value: totalCollected.toLocaleString() },
    { label: "Outstanding (KES)",   value: (totalBilled - totalCollected).toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Members", "Total (KES)", "Paid (KES)", "Balance (KES)", "Status"];
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
    { label: "Total Used (KES)", value: totalUsed.toLocaleString() },
    { label: "Total Limit (KES)",value: totalLimit.toLocaleString() },
    { label: "Utilization %",    value: totalLimit > 0 ? `${((totalUsed / totalLimit) * 100).toFixed(1)}%` : "—" },
  ];
  const headers = ["Member No.", "Name", "Group", "Benefit", "Limit (KES)", "Used (KES)", "Remaining (KES)", "Period"];
  const data = rows.map(r => {
    const limit = Number(r.benefitConfig.annualSubLimit);
    const used  = Number(r.amountUsed);
    const period = `${new Date(r.periodStart).toLocaleDateString("en-KE", { month: "short", year: "numeric" })} – ${new Date(r.periodEnd).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}`;
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
    { label: "Net Adjustment (KES)", value: totalAdj.toLocaleString() },
  ];
  const headers = ["Endorsement No.", "Group", "Type", "Status", "Effective Date", "Adj. (KES)", "Created"];
  const data = rows.map(r => [
    r.endorsementNumber,
    r.group.name,
    r.type.replace(/_/g, " "),
    r.status,
    new Date(r.effectiveDate).toLocaleDateString("en-KE"),
    r.proratedAmount ? Number(r.proratedAmount).toLocaleString() : "—",
    new Date(r.createdAt).toLocaleDateString("en-KE"),
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
    { label: "Accepted Premium (KES)", value: totalPremium.toLocaleString() },
  ];
  const headers = ["Quote No.", "Group / Prospect", "Members", "Annual Premium (KES)", "Status", "Valid Until", "Created"];
  const data = rows.map(r => [
    r.quoteNumber,
    r.group?.name ?? r.prospectName ?? "—",
    r.memberCount?.toString() ?? "—",
    r.annualPremium ? Number(r.annualPremium).toLocaleString() : "—",
    r.status,
    r.validUntil ? new Date(r.validUntil).toLocaleDateString("en-KE") : "—",
    new Date(r.createdAt).toLocaleDateString("en-KE"),
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
    { label: "Total Spend (KES)", value: totalSpend.toLocaleString() },
    { label: "Avg Cost / Case",   value: sorted.length > 0 ? Math.round(totalSpend / sorted.reduce((s, [, v]) => s + v.count, 0)).toLocaleString() : "—" },
  ];

  const headers = ["ICD Code", "Condition / Diagnosis", "Cases", "Total Approved (KES)", "Avg Cost (KES)", "Groups Affected"];
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
    { label: "Total Outstanding (KES)", value: totalOutstanding.toLocaleString() },
    { label: "Overdue",                 value: overdue.length.toLocaleString() },
    { label: "Overdue Amount (KES)",    value: overdue.reduce((s, r) => s + Number(r.balance), 0).toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Due Date", "Total (KES)", "Paid (KES)", "Balance (KES)", "Status", "Days Overdue"];
  const today = new Date();
  const data = rows.map(r => {
    const due = new Date(r.dueDate);
    const daysOverdue = due < today ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0;
    return [
      r.invoiceNumber,
      r.group.name,
      r.period,
      due.toLocaleDateString("en-KE"),
      Number(r.totalAmount).toLocaleString(),
      Number(r.paidAmount).toLocaleString(),
      Number(r.balance).toLocaleString(),
      r.status.replace(/_/g, " "),
      daysOverdue > 0 ? daysOverdue.toString() : "—",
    ];
  });
  return { kpis, headers, data };
}

async function getProviderStatementsData(tenantId: string) {
  const rows = await prisma.claim.findMany({
    where: { tenantId, status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } },
    select: {
      claimNumber: true, dateOfService: true, billedAmount: true,
      approvedAmount: true, paidAmount: true, status: true,
      benefitCategory: true,
      provider: { select: { name: true, type: true } },
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: [{ provider: { name: "asc" } }, { dateOfService: "desc" }],
  });
  const totalApproved = rows.reduce((s, r) => s + Number(r.approvedAmount), 0);
  const totalPaid     = rows.reduce((s, r) => s + Number(r.paidAmount), 0);
  const providers     = new Set(rows.map(r => r.provider.name)).size;
  const kpis = [
    { label: "Claims",                value: rows.length.toLocaleString() },
    { label: "Providers",             value: providers.toLocaleString() },
    { label: "Total Approved (KES)",  value: totalApproved.toLocaleString() },
    { label: "Total Paid (KES)",      value: totalPaid.toLocaleString() },
  ];
  const headers = ["Provider", "Claim No.", "Member", "Category", "Date of Service", "Billed (KES)", "Approved (KES)", "Paid (KES)", "Status"];
  const data = rows.map(r => [
    r.provider.name,
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.benefitCategory.replace(/_/g, " "),
    new Date(r.dateOfService).toLocaleDateString("en-KE"),
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
    { label: "Total Billed (KES)",   value: members.reduce((s, m) => s + m.claims.reduce((c, cl) => c + Number(cl.billedAmount), 0), 0).toLocaleString() },
    { label: "Total Approved (KES)", value: members.reduce((s, m) => s + m.claims.reduce((c, cl) => c + Number(cl.approvedAmount), 0), 0).toLocaleString() },
    { label: "Co-Contrib Collected", value: members.reduce((s, m) => s + m.coContributionTransactions.reduce((c, t) => c + Number(t.amountCollected ?? 0), 0), 0).toLocaleString() },
  ];
  const headers = ["Member No.", "Name", "Group", "Package", "Claims", "Total Billed (KES)", "Approved (KES)", "Co-Contrib Owed (KES)", "Co-Contrib Paid (KES)"];
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
  const headers = ["Member No.", "Name", "Group", "Benefit Category", "Limit (KES)", "Used (KES)", "Utilisation %", "Status"];
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
    { label: "Total Billed (KES)",  value: totalBilled.toLocaleString() },
    { label: "Avg Length of Stay",  value: `${avgLOS.toFixed(1)} days` },
    { label: "Unique Providers",    value: new Set(rows.map(r => r.provider.name)).size.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Group", "Provider", "Admission Date", "Discharge Date", "LOS (Days)", "Billed (KES)", "Status"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.member.group.name,
    r.provider.name,
    r.admissionDate ? new Date(r.admissionDate).toLocaleDateString("en-KE") : "—",
    r.dischargeDate ? new Date(r.dischargeDate).toLocaleDateString("en-KE") : "—",
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
    { label: "Total Billed (KES)", value: totalBilled.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Group", "Provider", "Date", "Category", "Billed (KES)", "Status"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.member.group.name,
    r.provider.name,
    new Date(r.dateOfService).toLocaleDateString("en-KE"),
    r.benefitCategory.replace(/_/g, " "),
    Number(r.billedAmount).toLocaleString(),
    r.status.replace(/_/g, " "),
  ]);
  return { kpis, headers, data };
}

// ── TRANCHE 2: Financial ──────────────────────────────────────────────────────

async function getLossRatioData(tenantId: string) {
  const groups = await prisma.group.findMany({
    where: { tenantId },
    select: {
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
    return { name: g.name, premium, claims, lossRatio };
  }).filter(r => r.premium > 0).sort((a, b) => b.lossRatio - a.lossRatio);

  const totalPremium = rows.reduce((s, r) => s + r.premium, 0);
  const totalClaims  = rows.reduce((s, r) => s + r.claims, 0);
  const overallRatio = totalPremium > 0 ? (totalClaims / totalPremium) * 100 : 0;

  const kpis = [
    { label: "Groups",              value: rows.length.toLocaleString() },
    { label: "Total Premium (KES)", value: totalPremium.toLocaleString() },
    { label: "Total Claims (KES)",  value: totalClaims.toLocaleString() },
    { label: "Overall Loss Ratio",  value: `${overallRatio.toFixed(1)}%` },
  ];
  const headers = ["Group", "Premium Collected (KES)", "Claims Approved (KES)", "Loss Ratio %", "Rating"];
  const data = rows.map(r => [
    r.name,
    r.premium.toLocaleString(),
    r.claims.toLocaleString(),
    `${r.lossRatio.toFixed(1)}%`,
    r.lossRatio > 100 ? "LOSS" : r.lossRatio > 80 ? "HIGH" : r.lossRatio > 60 ? "MODERATE" : "PROFITABLE",
  ]);
  return { kpis, headers, data };
}

async function getClaimsExperienceData(tenantId: string) {
  const claims = await prisma.claim.findMany({
    where: { tenantId },
    select: {
      billedAmount: true, approvedAmount: true, status: true,
      benefitCategory: true, serviceType: true,
      member: { select: { group: { select: { name: true } } } },
    },
  });

  // Aggregate by group + category
  const byKey = new Map<string, { group: string; category: string; count: number; billed: number; approved: number; declined: number }>();
  for (const c of claims) {
    const key = `${c.member.group.name}||${c.benefitCategory}`;
    const row = byKey.get(key) ?? { group: c.member.group.name, category: c.benefitCategory, count: 0, billed: 0, approved: 0, declined: 0 };
    row.count++;
    row.billed   += Number(c.billedAmount);
    row.approved += Number(c.approvedAmount);
    if (["DECLINED", "VOID"].includes(c.status)) row.declined++;
    byKey.set(key, row);
  }
  const rows = [...byKey.values()].sort((a, b) => b.billed - a.billed);

  const kpis = [
    { label: "Groups × Categories",  value: rows.length.toLocaleString() },
    { label: "Total Billed (KES)",   value: rows.reduce((s, r) => s + r.billed, 0).toLocaleString() },
    { label: "Total Approved (KES)", value: rows.reduce((s, r) => s + r.approved, 0).toLocaleString() },
    { label: "Total Declined",       value: rows.reduce((s, r) => s + r.declined, 0).toLocaleString() },
  ];
  const headers = ["Group", "Benefit Category", "Claims", "Billed (KES)", "Approved (KES)", "Declined", "Approval Rate %"];
  const data = rows.map(r => [
    r.group,
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
    { label: "0-30 Days (KES)",  value: buckets["0-30"].toLocaleString() },
    { label: "31-60 Days (KES)", value: buckets["31-60"].toLocaleString() },
    { label: "61-90 Days (KES)", value: buckets["61-90"].toLocaleString() },
    { label: "91+ Days (KES)",   value: buckets["91+"].toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Due Date", "Days Overdue", "Balance (KES)", "Bucket", "Status"];
  const data = bucketed.map(r => [
    r.invoiceNumber,
    r.group.name,
    new Date(r.dueDate).toLocaleDateString("en-KE"),
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
    { label: "Total Earned (KES)",   value: totalEarned.toLocaleString() },
    { label: "Total Paid (KES)",     value: totalPaid.toLocaleString() },
    { label: "Outstanding (KES)",    value: (totalEarned - totalPaid).toLocaleString() },
  ];
  const headers = ["Broker", "Period", "Rate %", "Amount (KES)", "Status", "Earned Date", "Paid Date"];
  const data = rows.map(r => [
    r.broker.name,
    r.period,
    `${Number(r.commissionRate).toFixed(1)}%`,
    Number(r.commissionAmount).toLocaleString(),
    r.paymentStatus,
    new Date(r.createdAt).toLocaleDateString("en-KE"),
    r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-KE") : "—",
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
    { label: "Stamp Duty (KES)",      value: totalStamp.toLocaleString() },
    { label: "Training Levy (KES)",   value: totalLevy.toLocaleString() },
    { label: "PHCF (KES)",            value: totalPhcf.toLocaleString() },
    { label: "Total Tax Collected",   value: totalTax.toLocaleString() },
  ];
  const headers = ["Invoice No.", "Group", "Period", "Total Invoice (KES)", "Stamp Duty", "Training Levy", "PHCF", "Tax Total"];
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
    { label: "Total Deposited (KES)",value: totalDeposited.toLocaleString() },
    { label: "Claims Deducted (KES)",value: totalClaims.toLocaleString() },
    { label: "Current Balance (KES)",value: totalBalance.toLocaleString() },
  ];
  const headers = ["Group", "Current Balance (KES)", "Total Deposited (KES)", "Claims Deducted (KES)", "Admin Fees (KES)", "Period Start", "Period End"];
  const data = accounts.map(a => [
    a.group.name,
    Number(a.balance).toLocaleString(),
    Number(a.totalDeposited).toLocaleString(),
    Number(a.totalClaims).toLocaleString(),
    Number(a.totalAdminFees).toLocaleString(),
    new Date(a.periodStartDate).toLocaleDateString("en-KE"),
    new Date(a.periodEndDate).toLocaleDateString("en-KE"),
  ]);
  return { kpis, headers, data };
}

// ── TRANCHE 3: Analytical ─────────────────────────────────────────────────────

async function getExclusionRejectedData(tenantId: string) {
  const rows = await prisma.claim.findMany({
    where: { tenantId, status: { in: ["DECLINED", "VOID", "APPEAL_DECLINED"] } },
    select: {
      claimNumber: true, status: true, billedAmount: true,
      declineReasonCode: true, declineNotes: true, decidedAt: true,
      benefitCategory: true,
      member: { select: { memberNumber: true, firstName: true, lastName: true } },
      provider: { select: { name: true } },
    },
    orderBy: { decidedAt: "desc" },
    take: 200,
  });
  const byReason = new Map<string, number>();
  rows.forEach(r => {
    const reason = r.declineReasonCode ?? "OTHER";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  });
  const topReason = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];
  const kpis = [
    { label: "Total Excluded/Declined", value: rows.length.toLocaleString() },
    { label: "Total Billed (KES)",      value: rows.reduce((s, r) => s + Number(r.billedAmount), 0).toLocaleString() },
    { label: "Top Decline Reason",      value: topReason ? `${topReason[0]} (${topReason[1]})` : "—" },
    { label: "Unique Reason Codes",     value: byReason.size.toLocaleString() },
  ];
  const headers = ["Claim No.", "Member", "Provider", "Category", "Status", "Decline Reason", "Billed (KES)", "Decided"];
  const data = rows.map(r => [
    r.claimNumber,
    `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
    r.provider.name,
    r.benefitCategory.replace(/_/g, " "),
    r.status.replace(/_/g, " "),
    r.declineReasonCode ?? "—",
    Number(r.billedAmount).toLocaleString(),
    r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("en-KE") : "—",
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
    { label: "Total Approved (KES)",value: rows.reduce((s, r) => s + r.totalKES, 0).toLocaleString() },
    { label: "Most Active",         value: rows[0]?.name ?? "—" },
  ];
  const headers = ["Operator", "Role", "Total Decisions", "Approved", "Declined", "Approval Rate %", "Total Approved (KES)"];
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
    u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-KE") : "Never",
    new Date(u.createdAt).toLocaleDateString("en-KE"),
  ]);
  return { kpis, headers, data };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportType: string }>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const { reportType } = await params;
  const tenantId = session.user.tenantId;
  const title = REPORT_TITLES[reportType] ?? "Report";

  let kpis: { label: string; value: string }[] = [];
  let headers: string[] = [];
  let data: string[][] = [];

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
  else if (reportType === "loss-ratio")          ({ kpis, headers, data } = await getLossRatioData(tenantId));
  else if (reportType === "claims-experience")   ({ kpis, headers, data } = await getClaimsExperienceData(tenantId));
  else if (reportType === "ageing-analysis")     ({ kpis, headers, data } = await getAgeingAnalysisData(tenantId));
  else if (reportType === "commission-statements")({ kpis, headers, data } = await getCommissionStatementsData(tenantId));
  else if (reportType === "levies-taxes")        ({ kpis, headers, data } = await getLeviesTaxesData(tenantId));
  else if (reportType === "fund-utilisation")    ({ kpis, headers, data } = await getFundUtilisationData(tenantId));
  // Tranche 3
  else if (reportType === "exclusion-rejected")  ({ kpis, headers, data } = await getExclusionRejectedData(tenantId));
  else if (reportType === "claims-per-operator") ({ kpis, headers, data } = await getClaimsPerOperatorData(tenantId));
  else if (reportType === "user-rights-roles")   ({ kpis, headers, data } = await getUserRightsRolesData(tenantId));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{title}</h1>
            <p className="text-avenue-text-body text-sm mt-0.5">
              Avenue Healthcare · {data.length} record{data.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {data.length > 0 && (
          <a
            href={`/api/reports/${reportType}/export`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-avenue-indigo border border-avenue-indigo/30 rounded-full hover:bg-avenue-indigo hover:text-white transition-colors"
          >
            <Download size={15} />
            Export CSV
          </a>
        )}
      </div>

      {/* KPI cards */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs text-avenue-text-muted font-bold uppercase">{k.label}</p>
              <p className="text-2xl font-bold text-avenue-indigo mt-1">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Data</h2>
        </div>
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE] text-xs">
                  {headers.map(h => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-[#F8F9FA]">
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap text-xs">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-avenue-text-body text-sm">
            No data found.
          </div>
        )}
      </div>
    </div>
  );
}
