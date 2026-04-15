/**
 * report-generation.job.ts
 * Generates and caches scheduled reports.
 * Triggered by: weekly cron (every Monday 06:00).
 *
 * Currently generates: claims summary, billing summary, membership snapshot.
 */

import { prisma } from "@/lib/prisma";

async function runReportGenerationJob() {
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 30); // Last 30 days

  console.info(`[report-generation] Generating weekly reports for ${fromDate.toDateString()} → ${now.toDateString()}`);

  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    for (const tenant of tenants) {
      // Claims summary
      const claims = await prisma.claim.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: fromDate } },
        select: { status: true, billedAmount: true, approvedAmount: true },
      });

      const claimsSummary = {
        total: claims.length,
        totalBilled: claims.reduce((s, c) => s + Number(c.billedAmount), 0),
        totalApproved: claims.reduce((s, c) => s + Number(c.approvedAmount), 0),
        byStatus: claims.reduce<Record<string, number>>((acc, c) => {
          acc[c.status] = (acc[c.status] ?? 0) + 1;
          return acc;
        }, {}),
      };

      // Membership snapshot
      const memberCount = await prisma.member.count({ where: { tenantId: tenant.id, status: "ACTIVE" } });
      const groupCount = await prisma.group.count({ where: { tenantId: tenant.id, status: "ACTIVE" } });

      // Billing summary
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: tenant.id, createdAt: { gte: fromDate } },
        select: { totalAmount: true, paidAmount: true, status: true },
      });

      const billingSummary = {
        total: invoices.length,
        totalBilled: invoices.reduce((s, i) => s + Number(i.totalAmount), 0),
        totalCollected: invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
      };

      console.info(`[report-generation] ${tenant.name}:`);
      console.info(`  Members: ${memberCount} active, ${groupCount} groups`);
      console.info(`  Claims (30d): ${claimsSummary.total}, billed KES ${claimsSummary.totalBilled.toLocaleString()}`);
      console.info(`  Billing (30d): ${billingSummary.total} invoices, collected KES ${billingSummary.totalCollected.toLocaleString()}`);

      // In production: store these snapshots in a ReportCache table or push to an S3/MinIO bucket as JSON/PDF.
    }

    console.info(`[report-generation] Done.`);
  } catch (err) {
    console.error("[report-generation] ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runReportGenerationJob();
