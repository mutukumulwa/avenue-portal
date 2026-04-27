import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  return lines.join("\r\n");
}

async function fetchReportData(
  tenantId: string,
  reportType: string
): Promise<{ headers: string[]; rows: string[][] } | null> {
  switch (reportType) {
    case "claims": {
      const data = await prisma.claim.findMany({
        where: { tenantId },
        select: {
          claimNumber: true, status: true, billedAmount: true, approvedAmount: true,
          benefitCategory: true, createdAt: true,
          member: { select: { firstName: true, lastName: true } },
          provider: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Claim No.", "Member", "Provider", "Category", "Billed (KES)", "Approved (KES)", "Status", "Date"],
        rows: data.map((r) => [
          r.claimNumber,
          `${r.member.firstName} ${r.member.lastName}`,
          r.provider.name,
          r.benefitCategory,
          Number(r.billedAmount).toString(),
          r.approvedAmount ? Number(r.approvedAmount).toString() : "",
          r.status,
          new Date(r.createdAt).toISOString().split("T")[0],
        ]),
      };
    }

    case "membership": {
      const data = await prisma.member.findMany({
        where: { tenantId },
        select: {
          memberNumber: true, firstName: true, lastName: true, status: true,
          relationship: true, gender: true, enrollmentDate: true,
          group: { select: { name: true } },
          package: { select: { name: true } },
        },
        orderBy: { enrollmentDate: "desc" },
      });
      return {
        headers: ["Member No.", "First Name", "Last Name", "Group", "Package", "Relationship", "Gender", "Status", "Enrolled"],
        rows: data.map((r) => [
          r.memberNumber,
          r.firstName,
          r.lastName,
          r.group.name,
          r.package.name,
          r.relationship,
          r.gender,
          r.status,
          new Date(r.enrollmentDate).toISOString().split("T")[0],
        ]),
      };
    }

    case "preauth": {
      const data = await prisma.preAuthorization.findMany({
        where: { tenantId },
        select: {
          preauthNumber: true, status: true, benefitCategory: true,
          estimatedCost: true, approvedAmount: true, serviceType: true, createdAt: true,
          member: { select: { firstName: true, lastName: true } },
          provider: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["PA No.", "Member", "Provider", "Category", "Service Type", "Estimated (KES)", "Approved (KES)", "Status", "Date"],
        rows: data.map((r) => [
          r.preauthNumber,
          `${r.member.firstName} ${r.member.lastName}`,
          r.provider.name,
          r.benefitCategory,
          r.serviceType,
          Number(r.estimatedCost).toString(),
          r.approvedAmount ? Number(r.approvedAmount).toString() : "",
          r.status,
          new Date(r.createdAt).toISOString().split("T")[0],
        ]),
      };
    }

    case "billing": {
      const data = await prisma.invoice.findMany({
        where: { tenantId },
        select: {
          invoiceNumber: true, period: true, memberCount: true,
          totalAmount: true, paidAmount: true, balance: true,
          status: true, dueDate: true,
          group: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Invoice No.", "Group", "Period", "Members", "Total (KES)", "Paid (KES)", "Balance (KES)", "Status", "Due Date"],
        rows: data.map((r) => [
          r.invoiceNumber,
          r.group.name,
          r.period,
          r.memberCount.toString(),
          Number(r.totalAmount).toString(),
          Number(r.paidAmount).toString(),
          Number(r.balance).toString(),
          r.status,
          r.dueDate ? new Date(r.dueDate).toISOString().split("T")[0] : "",
        ]),
      };
    }

    case "utilization": {
      const data = await prisma.benefitUsage.findMany({
        where: { member: { tenantId } },
        select: {
          amountUsed: true, periodStart: true, periodEnd: true,
          member: { select: { firstName: true, lastName: true, memberNumber: true, group: { select: { name: true } } } },
          benefitConfig: { select: { category: true, annualSubLimit: true } },
        },
        orderBy: { amountUsed: "desc" },
      });
      return {
        headers: ["Member No.", "Name", "Group", "Benefit", "Limit (KES)", "Used (KES)", "Remaining (KES)", "Period Start", "Period End"],
        rows: data.map((r) => {
          const limit = Number(r.benefitConfig.annualSubLimit);
          const used  = Number(r.amountUsed);
          return [
            r.member.memberNumber,
            `${r.member.firstName} ${r.member.lastName}`,
            r.member.group.name,
            r.benefitConfig.category,
            limit.toString(),
            used.toString(),
            Math.max(0, limit - used).toString(),
            new Date(r.periodStart).toISOString().split("T")[0],
            new Date(r.periodEnd).toISOString().split("T")[0],
          ];
        }),
      };
    }

    case "endorsements": {
      const data = await prisma.endorsement.findMany({
        where: { tenantId },
        select: {
          endorsementNumber: true, type: true, status: true,
          effectiveDate: true, proratedAmount: true, createdAt: true,
          group: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Endorsement No.", "Group", "Type", "Status", "Effective Date", "Adjustment (KES)", "Created"],
        rows: data.map((r) => [
          r.endorsementNumber,
          r.group.name,
          r.type,
          r.status,
          new Date(r.effectiveDate).toISOString().split("T")[0],
          r.proratedAmount ? Number(r.proratedAmount).toString() : "",
          new Date(r.createdAt).toISOString().split("T")[0],
        ]),
      };
    }

    case "quotations": {
      const data = await prisma.quotation.findMany({
        where: { tenantId },
        select: {
          quoteNumber: true, status: true, annualPremium: true,
          memberCount: true, validUntil: true, createdAt: true,
          group: { select: { name: true } },
          prospectName: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Quote No.", "Group / Prospect", "Members", "Annual Premium (KES)", "Status", "Valid Until", "Created"],
        rows: data.map((r) => [
          r.quoteNumber,
          r.group?.name ?? r.prospectName ?? "",
          r.memberCount?.toString() ?? "",
          r.annualPremium ? Number(r.annualPremium).toString() : "",
          r.status,
          r.validUntil ? new Date(r.validUntil).toISOString().split("T")[0] : "",
          new Date(r.createdAt).toISOString().split("T")[0],
        ]),
      };
    }

    case "chronic-disease": {
      const claims = await prisma.claim.findMany({
        where: { tenantId, status: { in: ["APPROVED", "PAID", "PARTIALLY_APPROVED"] } },
        select: {
          diagnoses: true,
          approvedAmount: true,
          member: { select: { group: { select: { name: true } } } },
        },
      });

      const byCode = new Map<string, { description: string; count: number; totalCost: number; groups: Set<string> }>();
      for (const claim of claims) {
        const diagnoses = claim.diagnoses as { code?: string; icdCode?: string; description: string }[];
        if (!Array.isArray(diagnoses)) continue;
        for (const d of diagnoses) {
          const code = d.code ?? d.icdCode ?? "UNKNOWN";
          const entry = byCode.get(code) ?? { description: d.description, count: 0, totalCost: 0, groups: new Set<string>() };
          entry.count += 1;
          entry.totalCost += Number(claim.approvedAmount ?? 0);
          entry.groups.add(claim.member.group.name);
          byCode.set(code, entry);
        }
      }

      const sorted = Array.from(byCode.entries()).sort(([, a], [, b]) => b.count - a.count);
      return {
        headers: ["ICD Code", "Condition", "Cases", "Total Approved (KES)", "Avg Cost (KES)", "Groups Affected"],
        rows: sorted.map(([code, v]) => [
          code,
          v.description,
          v.count.toString(),
          v.totalCost.toString(),
          Math.round(v.totalCost / v.count).toString(),
          v.groups.size.toString(),
        ]),
      };
    }

    // ── Tranche 1 ────────────────────────────────────────────────────────────

    case "outstanding-bills": {
      const today = new Date();
      const rows = await prisma.invoice.findMany({
        where: { tenantId, status: { in: ["OVERDUE", "PARTIALLY_PAID", "SENT"] }, balance: { gt: 0 } },
        select: { invoiceNumber: true, period: true, dueDate: true, totalAmount: true, paidAmount: true, balance: true, status: true, group: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      });
      return {
        headers: ["Invoice No.", "Group", "Period", "Due Date", "Total (KES)", "Paid (KES)", "Balance (KES)", "Status", "Days Overdue"],
        rows: rows.map(r => {
          const days = Math.max(0, Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86400000));
          return [r.invoiceNumber, r.group.name, r.period, new Date(r.dueDate).toISOString().split("T")[0],
            Number(r.totalAmount).toString(), Number(r.paidAmount).toString(), Number(r.balance).toString(),
            r.status, days > 0 ? days.toString() : "0"];
        }),
      };
    }

    case "provider-statements": {
      const rows = await prisma.claim.findMany({
        where: { tenantId, status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } },
        select: { claimNumber: true, dateOfService: true, billedAmount: true, approvedAmount: true, paidAmount: true, status: true, benefitCategory: true,
          provider: { select: { name: true } }, member: { select: { firstName: true, lastName: true, memberNumber: true } } },
        orderBy: [{ provider: { name: "asc" } }, { dateOfService: "desc" }],
      });
      return {
        headers: ["Provider", "Claim No.", "Member", "Category", "Date", "Billed (KES)", "Approved (KES)", "Paid (KES)", "Status"],
        rows: rows.map(r => [r.provider.name, r.claimNumber, `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
          r.benefitCategory, new Date(r.dateOfService).toISOString().split("T")[0],
          Number(r.billedAmount).toString(), Number(r.approvedAmount).toString(), Number(r.paidAmount).toString(), r.status]),
      };
    }

    case "member-statements": {
      const members = await prisma.member.findMany({
        where: { tenantId, status: "ACTIVE" },
        select: { memberNumber: true, firstName: true, lastName: true,
          group: { select: { name: true } }, package: { select: { name: true } },
          claims: { where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } }, select: { billedAmount: true, approvedAmount: true } },
          coContributionTransactions: { select: { finalAmount: true, amountCollected: true } },
        },
        orderBy: [{ group: { name: "asc" } }, { lastName: "asc" }],
      });
      return {
        headers: ["Member No.", "Name", "Group", "Package", "Claims", "Billed (KES)", "Approved (KES)", "Co-Contrib Owed (KES)", "Co-Contrib Paid (KES)"],
        rows: members.map(m => [
          m.memberNumber, `${m.firstName} ${m.lastName}`, m.group.name, m.package.name,
          m.claims.length.toString(),
          m.claims.reduce((s, c) => s + Number(c.billedAmount), 0).toString(),
          m.claims.reduce((s, c) => s + Number(c.approvedAmount), 0).toString(),
          m.coContributionTransactions.reduce((s, t) => s + Number(t.finalAmount), 0).toString(),
          m.coContributionTransactions.reduce((s, t) => s + Number(t.amountCollected ?? 0), 0).toString(),
        ]),
      };
    }

    case "exceeded-limits": {
      const usages = await prisma.benefitUsage.findMany({
        where: { member: { tenantId, status: "ACTIVE" } },
        select: { amountUsed: true,
          member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } },
          benefitConfig: { select: { category: true, annualSubLimit: true } },
        },
      });
      const flagged = usages
        .map(u => ({ ...u, pct: Number(u.benefitConfig.annualSubLimit) > 0 ? (Number(u.amountUsed) / Number(u.benefitConfig.annualSubLimit)) * 100 : 0 }))
        .filter(u => u.pct >= 80).sort((a, b) => b.pct - a.pct);
      return {
        headers: ["Member No.", "Name", "Group", "Category", "Limit (KES)", "Used (KES)", "Utilisation %", "Flag"],
        rows: flagged.map(u => [u.member.memberNumber, `${u.member.firstName} ${u.member.lastName}`, u.member.group.name,
          u.benefitConfig.category, Number(u.benefitConfig.annualSubLimit).toString(), Number(u.amountUsed).toString(),
          u.pct.toFixed(1), u.pct >= 100 ? "EXCEEDED" : "WARNING"]),
      };
    }

    case "admissions": {
      const rows = await prisma.claim.findMany({
        where: { tenantId, serviceType: "INPATIENT" },
        select: { claimNumber: true, admissionDate: true, dischargeDate: true, lengthOfStay: true,
          billedAmount: true, status: true, provider: { select: { name: true } },
          member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } } },
        orderBy: { admissionDate: "desc" },
      });
      return {
        headers: ["Claim No.", "Member", "Group", "Provider", "Admission Date", "Discharge Date", "LOS", "Billed (KES)", "Status"],
        rows: rows.map(r => [r.claimNumber, `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`, r.member.group.name,
          r.provider.name, r.admissionDate ? new Date(r.admissionDate).toISOString().split("T")[0] : "",
          r.dischargeDate ? new Date(r.dischargeDate).toISOString().split("T")[0] : "",
          r.lengthOfStay?.toString() ?? "", Number(r.billedAmount).toString(), r.status]),
      };
    }

    case "admission-visits": {
      const rows = await prisma.claim.findMany({
        where: { tenantId, serviceType: "OUTPATIENT" },
        select: { claimNumber: true, dateOfService: true, billedAmount: true, status: true, benefitCategory: true,
          provider: { select: { name: true } },
          member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } } },
        orderBy: { dateOfService: "desc" },
      });
      return {
        headers: ["Claim No.", "Member", "Group", "Provider", "Date", "Category", "Billed (KES)", "Status"],
        rows: rows.map(r => [r.claimNumber, `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`, r.member.group.name,
          r.provider.name, new Date(r.dateOfService).toISOString().split("T")[0],
          r.benefitCategory, Number(r.billedAmount).toString(), r.status]),
      };
    }

    // ── Tranche 2 ────────────────────────────────────────────────────────────

    case "loss-ratio": {
      const groups = await prisma.group.findMany({
        where: { tenantId },
        select: { name: true, invoices: { select: { paidAmount: true } },
          members: { select: { claims: { where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] } }, select: { approvedAmount: true } } } } },
      });
      const rows = groups.map(g => {
        const premium = g.invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
        const claims  = g.members.flatMap(m => m.claims).reduce((s, c) => s + Number(c.approvedAmount), 0);
        return { name: g.name, premium, claims, ratio: premium > 0 ? (claims / premium) * 100 : 0 };
      }).filter(r => r.premium > 0).sort((a, b) => b.ratio - a.ratio);
      return {
        headers: ["Group", "Premium (KES)", "Claims (KES)", "Loss Ratio %", "Rating"],
        rows: rows.map(r => [r.name, r.premium.toString(), r.claims.toString(), r.ratio.toFixed(1),
          r.ratio > 100 ? "LOSS" : r.ratio > 80 ? "HIGH" : r.ratio > 60 ? "MODERATE" : "PROFITABLE"]),
      };
    }

    case "claims-experience": {
      const claims = await prisma.claim.findMany({
        where: { tenantId },
        select: { billedAmount: true, approvedAmount: true, status: true, benefitCategory: true,
          member: { select: { group: { select: { name: true } } } } },
      });
      const byKey = new Map<string, { group: string; category: string; count: number; billed: number; approved: number; declined: number }>();
      for (const c of claims) {
        const key = `${c.member.group.name}||${c.benefitCategory}`;
        const row = byKey.get(key) ?? { group: c.member.group.name, category: c.benefitCategory, count: 0, billed: 0, approved: 0, declined: 0 };
        row.count++; row.billed += Number(c.billedAmount); row.approved += Number(c.approvedAmount);
        if (["DECLINED", "VOID"].includes(c.status)) row.declined++;
        byKey.set(key, row);
      }
      return {
        headers: ["Group", "Category", "Claims", "Billed (KES)", "Approved (KES)", "Declined", "Approval Rate %"],
        rows: [...byKey.values()].sort((a, b) => b.billed - a.billed).map(r => [
          r.group, r.category, r.count.toString(), r.billed.toString(), r.approved.toString(), r.declined.toString(),
          r.count > 0 ? ((( r.count - r.declined) / r.count) * 100).toFixed(1) : "0"]),
      };
    }

    case "ageing-analysis": {
      const today = new Date();
      const invoices = await prisma.invoice.findMany({
        where: { tenantId, balance: { gt: 0 }, status: { notIn: ["VOID", "PAID"] } },
        select: { invoiceNumber: true, dueDate: true, balance: true, status: true, group: { select: { name: true } } },
      });
      return {
        headers: ["Invoice No.", "Group", "Due Date", "Days Overdue", "Balance (KES)", "Bucket", "Status"],
        rows: invoices.map(inv => {
          const days = Math.max(0, Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
          const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "91+";
          return [inv.invoiceNumber, inv.group.name, new Date(inv.dueDate).toISOString().split("T")[0],
            days.toString(), Number(inv.balance).toString(), bucket, inv.status];
        }).sort((a, b) => Number(b[3]) - Number(a[3])),
      };
    }

    case "commission-statements": {
      const rows = await prisma.commission.findMany({
        where: { broker: { tenantId } },
        select: { period: true, commissionRate: true, commissionAmount: true,
          paymentStatus: true, paidAt: true, createdAt: true,
          broker: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Broker", "Period", "Rate %", "Amount (KES)", "Status", "Earned", "Paid"],
        rows: rows.map(r => [r.broker.name, r.period, Number(r.commissionRate).toFixed(1),
          Number(r.commissionAmount).toString(), r.paymentStatus,
          new Date(r.createdAt).toISOString().split("T")[0],
          r.paidAt ? new Date(r.paidAt).toISOString().split("T")[0] : ""]),
      };
    }

    case "levies-taxes": {
      const rows = await prisma.invoice.findMany({
        where: { tenantId },
        select: { invoiceNumber: true, period: true, totalAmount: true, stampDuty: true, trainingLevy: true, phcf: true, taxTotal: true,
          group: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        headers: ["Invoice No.", "Group", "Period", "Total (KES)", "Stamp Duty", "Training Levy", "PHCF", "Tax Total"],
        rows: rows.map(r => [r.invoiceNumber, r.group.name, r.period, Number(r.totalAmount).toString(),
          Number(r.stampDuty).toString(), Number(r.trainingLevy).toString(), Number(r.phcf).toString(), Number(r.taxTotal).toString()]),
      };
    }

    case "fund-utilisation": {
      const accounts = await prisma.selfFundedAccount.findMany({
        where: { tenantId }, include: { group: { select: { name: true } } },
      });
      return {
        headers: ["Group", "Balance (KES)", "Deposited (KES)", "Claims (KES)", "Admin Fees (KES)", "Period Start", "Period End"],
        rows: accounts.map(a => [a.group.name, Number(a.balance).toString(), Number(a.totalDeposited).toString(),
          Number(a.totalClaims).toString(), Number(a.totalAdminFees).toString(),
          new Date(a.periodStartDate).toISOString().split("T")[0], new Date(a.periodEndDate).toISOString().split("T")[0]]),
      };
    }

    // ── Tranche 3 ────────────────────────────────────────────────────────────

    case "exclusion-rejected": {
      const rows = await prisma.claim.findMany({
        where: { tenantId, status: { in: ["DECLINED", "VOID", "APPEAL_DECLINED"] } },
        select: { claimNumber: true, status: true, billedAmount: true, declineReasonCode: true, decidedAt: true, benefitCategory: true,
          member: { select: { memberNumber: true, firstName: true, lastName: true } },
          provider: { select: { name: true } } },
        orderBy: { decidedAt: "desc" },
      });
      return {
        headers: ["Claim No.", "Member", "Provider", "Category", "Status", "Decline Reason", "Billed (KES)", "Decided"],
        rows: rows.map(r => [r.claimNumber, `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`,
          r.provider.name, r.benefitCategory, r.status, r.declineReasonCode ?? "",
          Number(r.billedAmount).toString(), r.decidedAt ? new Date(r.decidedAt).toISOString().split("T")[0] : ""]),
      };
    }

    case "claims-per-operator": {
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
        const row = byUser.get(l.userId) ?? { name, role: u?.role ?? "", approved: 0, declined: 0, total: 0, totalKES: 0 };
        row.total++; row.totalKES += Number(l.amount ?? 0);
        if (["APPROVED", "PARTIALLY_APPROVED"].includes(l.action)) row.approved++;
        if (l.action === "DECLINED") row.declined++;
        byUser.set(l.userId, row);
      }
      return {
        headers: ["Operator", "Role", "Total", "Approved", "Declined", "Approval Rate %", "Total KES"],
        rows: [...byUser.values()].sort((a, b) => b.total - a.total).map(r => [
          r.name, r.role, r.total.toString(), r.approved.toString(), r.declined.toString(),
          r.total > 0 ? ((r.approved / r.total) * 100).toFixed(1) : "0", r.totalKES.toString()]),
      };
    }

    case "user-rights-roles": {
      const users = await prisma.user.findMany({
        where: { tenantId },
        select: { firstName: true, lastName: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
        orderBy: [{ role: "asc" }, { lastName: "asc" }],
      });
      return {
        headers: ["Name", "Email", "Role", "Active", "Last Login", "Created"],
        rows: users.map(u => [`${u.firstName} ${u.lastName}`, u.email, u.role, u.isActive ? "Yes" : "No",
          u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().split("T")[0] : "Never",
          new Date(u.createdAt).toISOString().split("T")[0]]),
      };
    }

    default:
      return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportType: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportType } = await params;
  const tenantId = session.user.tenantId;

  const result = await fetchReportData(tenantId, reportType);
  if (!result) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 404 });
  }

  const csv = buildCsv(result.headers, result.rows);
  const filename = `avenue-${reportType}-${new Date().toISOString().split("T")[0]}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
