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
