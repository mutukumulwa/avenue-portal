import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnalyticsAccessScope, type AnalyticsAccessScope } from "@/lib/analytics-access";
import { prisma } from "@/lib/prisma";
import { getExclusionRejectionRows } from "@/server/services/report-exclusions";

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

async function fetchReportData(
  tenantId: string,
  reportType: string,
  analyticsScope?: AnalyticsAccessScope,
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
        headers: ["Claim No.", "Member", "Provider", "Category", "Billed (UGX)", "Approved (UGX)", "Status", "Date"],
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
        headers: ["PA No.", "Member", "Provider", "Category", "Service Type", "Estimated (UGX)", "Approved (UGX)", "Status", "Date"],
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
        headers: ["Invoice No.", "Group", "Period", "Members", "Total (UGX)", "Paid (UGX)", "Balance (UGX)", "Status", "Due Date"],
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
        headers: ["Member No.", "Name", "Group", "Benefit", "Limit (UGX)", "Used (UGX)", "Remaining (UGX)", "Period Start", "Period End"],
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
        headers: ["Endorsement No.", "Group", "Type", "Status", "Effective Date", "Adjustment (UGX)", "Created"],
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
        headers: ["Quote No.", "Group / Prospect", "Members", "Annual Premium (UGX)", "Status", "Valid Until", "Created"],
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
        headers: ["ICD Code", "Condition", "Cases", "Total Approved (UGX)", "Avg Cost (UGX)", "Groups Affected"],
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
        headers: ["Invoice No.", "Group", "Period", "Due Date", "Total (UGX)", "Paid (UGX)", "Balance (UGX)", "Status", "Days Overdue"],
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
        headers: ["Provider", "Claim No.", "Member", "Category", "Date", "Billed (UGX)", "Approved (UGX)", "Paid (UGX)", "Status"],
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
        headers: ["Member No.", "Name", "Group", "Package", "Claims", "Billed (UGX)", "Approved (UGX)", "Co-Contrib Owed (UGX)", "Co-Contrib Paid (UGX)"],
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
        headers: ["Member No.", "Name", "Group", "Category", "Limit (UGX)", "Used (UGX)", "Utilisation %", "Flag"],
        rows: flagged.map(u => [u.member.memberNumber, `${u.member.firstName} ${u.member.lastName}`, u.member.group.name,
          u.benefitConfig.category, Number(u.benefitConfig.annualSubLimit).toString(), Number(u.amountUsed).toString(),
          u.pct.toFixed(1), u.pct >= 100 ? "EXCEEDED" : "WARNING"]),
      };
    }

    case "admissions": {
      // A2-DEF-01: one admission = one episode. Interim slices + the final bill
      // are many INPATIENT claims per admission (and a fully-sliced case files no
      // final), so source from ClinicalCase (billed = case accrued) + direct
      // inpatient claims that never opened a case (caseId: null).
      const losOf = (adm: Date | null, dis: Date | null, stored?: number | null): number | null => {
        if (stored != null) return stored;
        if (!adm) return null;
        return Math.max(1, Math.ceil(((dis ? new Date(dis).getTime() : Date.now()) - new Date(adm).getTime()) / 86_400_000));
      };
      const [caseRows, directRows] = await Promise.all([
        prisma.clinicalCase.findMany({
          where: { tenantId },
          select: { caseNumber: true, admissionDate: true, dischargeDate: true, accruedAmount: true, status: true,
            provider: { select: { name: true } },
            member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } } },
          orderBy: { admissionDate: "desc" },
        }),
        prisma.claim.findMany({
          where: { tenantId, serviceType: "INPATIENT", caseId: null },
          select: { claimNumber: true, admissionDate: true, dischargeDate: true, lengthOfStay: true, billedAmount: true, status: true,
            provider: { select: { name: true } },
            member: { select: { memberNumber: true, firstName: true, lastName: true, group: { select: { name: true } } } } },
          orderBy: { admissionDate: "desc" },
        }),
      ]);
      const rows = [
        ...caseRows.map((c) => ({ ref: c.caseNumber, adm: c.admissionDate, dis: c.dischargeDate, los: losOf(c.admissionDate, c.dischargeDate),
          billed: Number(c.accruedAmount), status: c.status, member: `${c.member.firstName} ${c.member.lastName} (${c.member.memberNumber})`, group: c.member.group.name, provider: c.provider.name })),
        ...directRows.map((r) => ({ ref: r.claimNumber, adm: r.admissionDate, dis: r.dischargeDate, los: losOf(r.admissionDate, r.dischargeDate, r.lengthOfStay),
          billed: Number(r.billedAmount), status: r.status, member: `${r.member.firstName} ${r.member.lastName} (${r.member.memberNumber})`, group: r.member.group.name, provider: r.provider.name })),
      ].sort((a, b) => (b.adm ? new Date(b.adm).getTime() : 0) - (a.adm ? new Date(a.adm).getTime() : 0));
      return {
        headers: ["Case / Claim No.", "Member", "Group", "Provider", "Admission Date", "Discharge Date", "LOS", "Billed (UGX)", "Status"],
        rows: rows.map((r) => [r.ref, r.member, r.group, r.provider,
          r.adm ? new Date(r.adm).toISOString().split("T")[0] : "",
          r.dis ? new Date(r.dis).toISOString().split("T")[0] : "",
          r.los?.toString() ?? "", r.billed.toString(), r.status]),
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
        headers: ["Claim No.", "Member", "Group", "Provider", "Date", "Category", "Billed (UGX)", "Status"],
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
        headers: ["Group", "Premium (UGX)", "Claims (UGX)", "Loss Ratio %", "Rating"],
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
        headers: ["Group", "Category", "Claims", "Billed (UGX)", "Approved (UGX)", "Declined", "Approval Rate %"],
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
        headers: ["Invoice No.", "Group", "Due Date", "Days Overdue", "Balance (UGX)", "Bucket", "Status"],
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
        headers: ["Broker", "Period", "Rate %", "Amount (UGX)", "Status", "Earned", "Paid"],
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
        headers: ["Invoice No.", "Group", "Period", "Total (UGX)", "Stamp Duty", "Training Levy", "PHCF", "Tax Total"],
        rows: rows.map(r => [r.invoiceNumber, r.group.name, r.period, Number(r.totalAmount).toString(),
          Number(r.stampDuty).toString(), Number(r.trainingLevy).toString(), Number(r.phcf).toString(), Number(r.taxTotal).toString()]),
      };
    }

    case "fund-utilisation": {
      const accounts = await prisma.selfFundedAccount.findMany({
        where: { tenantId }, include: { group: { select: { name: true } } },
      });
      return {
        headers: ["Group", "Balance (UGX)", "Deposited (UGX)", "Claims (UGX)", "Admin Fees (UGX)", "Period Start", "Period End"],
        rows: accounts.map(a => [a.group.name, Number(a.balance).toString(), Number(a.totalDeposited).toString(),
          Number(a.totalClaims).toString(), Number(a.totalAdminFees).toString(),
          new Date(a.periodStartDate).toISOString().split("T")[0], new Date(a.periodEndDate).toISOString().split("T")[0]]),
      };
    }

    // ── Tranche 3 ────────────────────────────────────────────────────────────

    case "exclusion-rejected": {
      // NW-D03: shared line-aware source (also surfaces excluded lines inside
      // approved/partially-approved claims) — identical to the on-screen report.
      const rows = await getExclusionRejectionRows(tenantId);
      return {
        headers: ["Claim No.", "Member", "Provider", "Category", "Item", "Status", "Reason", "Disallowed (UGX)", "Decided"],
        rows: rows.map(r => [r.claimNumber, r.member, r.provider, r.category, r.scope, r.status,
          r.reason, r.disallowed.toString(), r.decidedAt ? new Date(r.decidedAt).toISOString().split("T")[0] : ""]),
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

    // ── Strategic Analytics ─────────────────────────────────────────────────

    case "analytics-portfolio-mlr": {
      const [snapshots, alerts] = await Promise.all([
        prisma.analyticsMlrSnapshot.findMany({
          where: { tenantId, grain: "SCHEME", ...reportGroupIdWhere(analyticsScope) },
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
          where: { tenantId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, groupId: { not: null }, ...reportGroupIdWhere(analyticsScope) },
          _count: { id: true },
        }),
      ]);

      const groupIds = snapshots.map((s) => s.groupId).filter(Boolean) as string[];
      const groups = await prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      });
      const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
      const alertCountByGroup = new Map(alerts.map((a) => [a.groupId, a._count.id]));

      const rows = snapshots
        .map((s) => {
          const claims = Number(s.benefitPaid) + Number(s.memberCoContribution);
          return {
            groupId: s.groupId ?? "",
            name: groupNameById.get(s.groupId ?? "") ?? "Unknown",
            period: s.period,
            contribution: Number(s.grossContribution),
            claims,
            mlr: Number(s.mlr),
            trailing12Mlr: Number(s.trailing12Mlr),
            alerts: alertCountByGroup.get(s.groupId) ?? 0,
          };
        })
        .filter((row) => row.groupId)
        .sort((a, b) => b.mlr - a.mlr);

      return {
        headers: ["Scheme", "Period", "Contribution (UGX)", "Claims (UGX)", "MLR %", "Trailing 12M MLR %", "Open Alerts"],
        rows: rows.map((row) => [
          row.name,
          row.period,
          row.contribution.toString(),
          row.claims.toString(),
          (row.mlr * 100).toFixed(1),
          (row.trailing12Mlr * 100).toFixed(1),
          row.alerts.toString(),
        ]),
      };
    }

    case "analytics-scheme-profitability": {
      const groups = await prisma.group.findMany({
        where: { tenantId, ...reportGroupWhere(analyticsScope) },
        select: { id: true, name: true },
      });
      const snapshots = await prisma.analyticsMlrSnapshot.findMany({
        where: { tenantId, grain: "SCHEME", ...reportGroupIdWhere(analyticsScope) },
        orderBy: [{ periodStart: "desc" }],
        distinct: ["groupId"],
        select: {
          groupId: true, period: true,
          grossContribution: true, benefitPaid: true, memberCoContribution: true,
          mlr: true, trailing12Mlr: true,
        },
      });
      const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
      const rows = snapshots
        .map((s) => {
          const contribution = Number(s.grossContribution);
          const claims = Number(s.benefitPaid) + Number(s.memberCoContribution);
          const surplus = contribution - claims;
          return {
            groupId: s.groupId ?? "",
            name: groupNameById.get(s.groupId ?? "") ?? "Unknown",
            period: s.period,
            contribution,
            claims,
            surplus,
            mlr: Number(s.mlr),
            trailing12Mlr: Number(s.trailing12Mlr),
          };
        })
        .filter((row) => row.groupId)
        .sort((a, b) => b.mlr - a.mlr);

      return {
        headers: ["Scheme", "Period", "Contribution (UGX)", "Claims (UGX)", "Surplus/Deficit (UGX)", "MLR %", "Trailing 12M MLR %", "Status"],
        rows: rows.map((row) => [
          row.name,
          row.period,
          row.contribution.toString(),
          row.claims.toString(),
          row.surplus.toString(),
          (row.mlr * 100).toFixed(1),
          (row.trailing12Mlr * 100).toFixed(1),
          row.mlr > 1 ? "LOSS" : row.mlr > 0.8 ? "HIGH" : row.mlr > 0.6 ? "MODERATE" : "PROFITABLE",
        ]),
      };
    }

    case "analytics-provider-performance": {
      const scopedProviderRows = analyticsScope?.allowedGroupIds || analyticsScope?.groupId || analyticsScope?.noAccess
        ? await prisma.analyticsEncounterFact.findMany({
            where: { tenantId, ...reportGroupIdWhere(analyticsScope) },
            distinct: ["providerId"],
            select: { providerId: true },
          })
        : null;
      const providerIds = scopedProviderRows?.map((row) => row.providerId);
      const latest = await prisma.providerScorecard.findFirst({
        where: { tenantId, ...(providerIds ? { providerId: { in: providerIds } } : {}) },
        orderBy: { periodStart: "desc" },
        select: { period: true },
      });
      if (!latest) {
        return {
          headers: ["Provider", "Tier", "Period", "Claims", "Members", "Adjusted Cost (UGX)", "Avg Cost (UGX)", "CMI", "Rejection Rate %"],
          rows: [],
        };
      }
      const scorecards = await prisma.providerScorecard.findMany({
        where: { tenantId, period: latest.period, ...(providerIds ? { providerId: { in: providerIds } } : {}) },
        orderBy: { adjustedCost: "desc" },
      });
      return {
        headers: ["Provider", "Tier", "Period", "Claims", "Members", "Adjusted Cost (UGX)", "Avg Cost (UGX)", "CMI", "Rejection Rate %"],
        rows: scorecards.map((row) => [
          row.providerName,
          row.providerTier ?? "UNKNOWN",
          row.period,
          row.claimCount.toString(),
          row.memberCount.toString(),
          Number(row.adjustedCost).toString(),
          Number(row.averageCost).toString(),
          Number(row.caseMixIndex).toFixed(2),
          (Number(row.rejectionRate) * 100).toFixed(1),
        ]),
      };
    }

    case "analytics-renewal-recommendations": {
      const analyses = await prisma.renewalAnalysis.findMany({
        where: { tenantId, ...reportGroupIdWhere(analyticsScope) },
        orderBy: { renewalDate: "asc" },
      });
      const groupIds = analyses.map((analysis) => analysis.groupId);
      const groups = await prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: {
          id: true, name: true,
          broker: { select: { name: true } },
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      });
      const groupById = new Map(groups.map((group) => [group.id, group]));
      const now = new Date();

      return {
        headers: ["Scheme", "Intermediary", "Members", "Renewal Date", "Days", "Trailing MLR %", "Target MLR %", "Recommended Contribution (UGX)", "Adjustment %"],
        rows: analyses.map((analysis) => {
          const group = groupById.get(analysis.groupId);
          const renewalDate = new Date(analysis.renewalDate);
          const daysToRenewal = Math.ceil((renewalDate.getTime() - now.getTime()) / 86400000);
          return [
            group?.name ?? "Unknown",
            group?.broker?.name ?? "Direct",
            (group?._count.members ?? 0).toString(),
            renewalDate.toISOString().split("T")[0],
            daysToRenewal.toString(),
            (Number(analysis.trailing12Mlr) * 100).toFixed(1),
            (Number(analysis.targetMlr) * 100).toFixed(1),
            Number(analysis.recommendedContribution).toString(),
            (Number(analysis.recommendedAdjustmentPct) * 100).toFixed(1),
          ];
        }),
      };
    }

    case "analytics-risk-distribution": {
      const profiles = await prisma.memberRiskProfile.groupBy({
        by: ["groupId", "riskTier"],
        where: { tenantId, ...reportGroupIdWhere(analyticsScope) },
        _count: { id: true },
        _avg: { riskScore: true, utilizationToCap: true },
      });
      const groupIds = [...new Set(profiles.map((profile) => profile.groupId))];
      const groups = await prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      });
      const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
      const totalByGroup = new Map<string, number>();
      for (const profile of profiles) {
        totalByGroup.set(profile.groupId, (totalByGroup.get(profile.groupId) ?? 0) + profile._count.id);
      }
      const tierOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
      const rows = profiles
        .map((profile) => ({
          groupId: profile.groupId,
          groupName: groupNameById.get(profile.groupId) ?? "Unknown",
          riskTier: profile.riskTier,
          count: profile._count.id,
          total: totalByGroup.get(profile.groupId) ?? 1,
          avgScore: Number(profile._avg.riskScore ?? 0),
          avgUtilization: Number(profile._avg.utilizationToCap ?? 0),
        }))
        .sort((a, b) => (tierOrder[a.riskTier] ?? 4) - (tierOrder[b.riskTier] ?? 4) || a.groupName.localeCompare(b.groupName));

      return {
        headers: ["Scheme", "Risk Tier", "Members", "% of Scheme", "Avg Risk Score", "Avg Utilization %"],
        rows: rows.map((row) => [
          row.groupName,
          row.riskTier,
          row.count.toString(),
          ((row.count / row.total) * 100).toFixed(1),
          row.avgScore.toFixed(2),
          (row.avgUtilization * 100).toFixed(1),
        ]),
      };
    }

    // ── Additional reports ────────────────────────────────────────────────────

    case "debtors-creditors": {
      const now = new Date();
      const bucket = (due: Date) => {
        const d = Math.ceil((now.getTime() - due.getTime()) / 864e5);
        if (d <= 0) return "Current"; if (d <= 30) return "1-30d";
        if (d <= 60) return "31-60d"; if (d <= 90) return "61-90d"; return "91+d";
      };
      const invoices = await prisma.invoice.findMany({
        where: { tenantId, balance: { gt: 0 } },
        select: { invoiceNumber: true, balance: true, dueDate: true, group: { select: { name: true } } },
      });
      const unsettled = await prisma.claim.findMany({
        where: { tenantId, status: { in: ["APPROVED","PARTIALLY_APPROVED"] }, settlementBatchId: null },
        select: { claimNumber: true, approvedAmount: true, provider: { select: { name: true } }, decidedAt: true },
      });
      return {
        headers: ["Reference", "Counterparty", "Amount (UGX)", "Type", "Age Bucket", "Date"],
        rows: [
          ...invoices.map(i => [i.invoiceNumber, i.group.name, Number(i.balance).toFixed(2), "Debtor", bucket(i.dueDate), new Date(i.dueDate).toISOString().split("T")[0]]),
          ...unsettled.map(c => [c.claimNumber, c.provider.name, Number(c.approvedAmount ?? 0).toFixed(2), "Creditor", "—", c.decidedAt ? new Date(c.decidedAt).toISOString().split("T")[0] : ""]),
        ],
      };
    }

    case "fees-statements": {
      const cardInv  = await prisma.invoice.findMany({ where: { tenantId, notes: { contains: "Card" } }, select: { invoiceNumber: true, totalAmount: true, createdAt: true, group: { select: { name: true } } } });
      const reinInv  = await prisma.invoice.findMany({ where: { tenantId, notes: { contains: "Reinstate" } }, select: { invoiceNumber: true, totalAmount: true, createdAt: true, group: { select: { name: true } } } });
      return {
        headers: ["Invoice No.", "Scheme", "Fee Type", "Amount (UGX)", "Date"],
        rows: [
          ...cardInv.map(i => [i.invoiceNumber, i.group.name, "Card Issuance", Number(i.totalAmount).toFixed(2), new Date(i.createdAt).toISOString().split("T")[0]]),
          ...reinInv.map(i => [i.invoiceNumber, i.group.name, "Reinstatement", Number(i.totalAmount).toFixed(2), new Date(i.createdAt).toISOString().split("T")[0]]),
        ],
      };
    }

    case "admin-fee": {
      const txs = await prisma.fundTransaction.findMany({
        where: { tenantId, type: "ADMIN_FEE" },
        select: { amount: true, postedAt: true, description: true, selfFundedAccount: { select: { group: { select: { name: true, adminFeeMethod: true } } } } },
        orderBy: { postedAt: "desc" },
      });
      return {
        headers: ["Scheme", "Calc Method", "Amount (UGX)", "Date", "Description"],
        rows: txs.map(t => [t.selfFundedAccount.group.name, t.selfFundedAccount.group.adminFeeMethod ?? "—", Number(t.amount).toFixed(2), new Date(t.postedAt).toISOString().split("T")[0], t.description ?? ""]),
      };
    }

    case "organic-growth": {
      const twelveAgo = new Date(); twelveAgo.setMonth(twelveAgo.getMonth() - 12);
      const [nm, la, ca] = await Promise.all([
        prisma.member.groupBy({ by: ["enrollmentDate"], where: { tenantId, enrollmentDate: { gte: twelveAgo } }, _count: { _all: true } }),
        prisma.membershipLapseRecord.groupBy({ by: ["lapseDate"], where: { tenantId, lapseDate: { gte: twelveAgo } }, _count: { _all: true } }),
        prisma.membershipCancellationRecord.groupBy({ by: ["effectiveDate"], where: { tenantId, effectiveDate: { gte: twelveAgo } }, _count: { _all: true } }),
      ]);
      const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const byM: Record<string, [number,number,number]> = {};
      for (const r of nm) { const k = mk(new Date(r.enrollmentDate)); if (!byM[k]) byM[k]=[0,0,0]; byM[k][0]+=r._count._all; }
      for (const r of la) { const k = mk(new Date(r.lapseDate)); if (!byM[k]) byM[k]=[0,0,0]; byM[k][1]+=r._count._all; }
      for (const r of ca) { const k = mk(new Date(r.effectiveDate)); if (!byM[k]) byM[k]=[0,0,0]; byM[k][2]+=r._count._all; }
      return {
        headers: ["Month", "New Enrolments", "Lapses", "Cancellations", "Net Growth"],
        rows: Object.entries(byM).sort(([a],[b])=>a.localeCompare(b)).map(([k,[n,l,c]]) => [k, n.toString(), l.toString(), c.toString(), (n-l-c).toString()]),
      };
    }

    case "comparison-services": {
      const lines = await prisma.claimLine.findMany({
        where: { claim: { tenantId } },
        select: { cptCode: true, description: true, billedAmount: true, approvedAmount: true, tariffRate: true },
        take: 5000,
      });
      const byCpt: Record<string, { desc: string; billed: number[]; approved: number[]; tariff: number[] }> = {};
      for (const l of lines) {
        const c = l.cptCode ?? "UNCODED";
        if (!byCpt[c]) byCpt[c] = { desc: l.description, billed: [], approved: [], tariff: [] };
        byCpt[c].billed.push(Number(l.billedAmount));
        if (l.approvedAmount) byCpt[c].approved.push(Number(l.approvedAmount));
        if (l.tariffRate) byCpt[c].tariff.push(Number(l.tariffRate));
      }
      const avg = (a: number[]) => a.length > 0 ? a.reduce((s,v)=>s+v,0)/a.length : 0;
      return {
        headers: ["CPT Code", "Description", "Avg Contracted (UGX)", "Avg Billed (UGX)", "Avg Approved (UGX)", "Billed vs Contracted", "Count"],
        rows: Object.entries(byCpt).sort(([a],[b])=>a.localeCompare(b)).map(([c,v]) => {
          const ab = avg(v.billed), at = avg(v.tariff);
          return [c, v.desc.slice(0,60), at > 0 ? at.toFixed(2) : "—", ab.toFixed(2), avg(v.approved).toFixed(2),
            at > 0 ? `${(((ab-at)/at)*100).toFixed(1)}%` : "—", v.billed.length.toString()];
        }),
      };
    }

    case "quotation-funnel": {
      const qs = await prisma.quotation.findMany({
        where: { tenantId },
        select: { quoteNumber: true, status: true, clientType: true, memberCount: true, finalPremium: true, createdAt: true, isRenewal: true, broker: { select: { name: true } } },
        orderBy: { createdAt: "desc" }, take: 500,
      });
      return {
        headers: ["Quote No.", "Status", "Client Type", "Lives", "Premium (UGX)", "Renewal", "Broker", "Date"],
        rows: qs.map(q => [q.quoteNumber, q.status, q.clientType ?? "—", q.memberCount.toString(),
          q.finalPremium ? Number(q.finalPremium).toFixed(2) : "—", q.isRenewal ? "Yes" : "No",
          q.broker?.name ?? "Direct", new Date(q.createdAt).toISOString().split("T")[0]]),
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

  const analyticsScope = await getAnalyticsAccessScope(session);
  const result = await fetchReportData(tenantId, reportType, analyticsScope);
  if (!result) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 404 });
  }

  const csv = buildCsv(result.headers, result.rows);
  const filename = `medvex-${reportType}-${new Date().toISOString().split("T")[0]}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
