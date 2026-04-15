import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

const REPORT_TITLES: Record<string, string> = {
  claims:          "Claims Summary Report",
  membership:      "Membership Report",
  preauth:         "Pre-Authorization Report",
  billing:         "Billing & Collections Report",
  utilization:     "Utilization Report",
  endorsements:    "Endorsement Report",
  quotations:      "Quotation Pipeline Report",
  "chronic-disease": "Chronic Disease Burden Report",
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

  if (reportType === "claims")             ({ kpis, headers, data } = await getClaimsData(tenantId));
  else if (reportType === "membership")    ({ kpis, headers, data } = await getMembershipData(tenantId));
  else if (reportType === "preauth")       ({ kpis, headers, data } = await getPreauthData(tenantId));
  else if (reportType === "billing")       ({ kpis, headers, data } = await getBillingData(tenantId));
  else if (reportType === "utilization")   ({ kpis, headers, data } = await getUtilizationData(tenantId));
  else if (reportType === "endorsements")  ({ kpis, headers, data } = await getEndorsementsData(tenantId));
  else if (reportType === "quotations")    ({ kpis, headers, data } = await getQuotationsData(tenantId));
  else if (reportType === "chronic-disease") ({ kpis, headers, data } = await getChronicDiseaseData(tenantId));

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
