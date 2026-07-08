/**
 * report-generation.job.ts
 * Generates and caches scheduled reports.
 * Triggered by: weekly cron (every Monday 06:00).
 *
 * Currently generates: claims summary, billing summary, membership snapshot.
 */

import { prisma } from "@/lib/prisma";
import { overrideService } from "../services/override.service";
import { AnalyticsService } from "../services/analytics.service";
import { pdfService } from "../services/pdf.service";
import { renderBoardPackHtml } from "../templates/pdf/board-pack.template";

export async function runReportGenerationJob() {
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
      console.info(`  Claims (30d): ${claimsSummary.total}, billed UGX ${claimsSummary.totalBilled.toLocaleString()}`);
      console.info(`  Billing (30d): ${billingSummary.total} invoices, collected UGX ${billingSummary.totalCollected.toLocaleString()}`);

      // In production: store these snapshots in a ReportCache table or push to an S3/MinIO bucket as JSON/PDF.

      // ── Process 13: Override compliance reports ───────────
      // Expire any SLA-breached overrides
      const expiredCount = await overrideService.expireSlaBreached(tenant.id);
      if (expiredCount > 0) {
        console.info(`  Overrides: ${expiredCount} SLA-breached record(s) expired`);
      }

      // Daily summary (stored to activity log for compliance inbox)
      const overrideSummary = await overrideService.generateDailySummary(tenant.id);
      if (overrideSummary.pending > 0 || overrideSummary.slaBreached > 0) {
        await prisma.activityLog.create({
          data: {
            entityType:  "SYSTEM",
            entityId:    tenant.id,
            action:      "OVERRIDE_DAILY_SUMMARY",
            description: `Override summary: ${overrideSummary.pending} pending, ${overrideSummary.approvedToday} approved, ${overrideSummary.rejectedToday} rejected, ${overrideSummary.slaBreached} SLA breached`,
            metadata:    overrideSummary as never,
          },
        });
      }

      // Monthly report — runs on the 1st of each month
      const now = new Date();
      if (now.getDate() === 1) {
        const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const monthlyReport = await overrideService.generateMonthlyReport(tenant.id, prevMonth, prevYear);
        await prisma.activityLog.create({
          data: {
            entityType:  "SYSTEM",
            entityId:    tenant.id,
            action:      "OVERRIDE_MONTHLY_REPORT",
            description: `Monthly override report for ${monthlyReport.period}: ${monthlyReport.totalRequested} requests, ${Math.round(monthlyReport.approvalRate * 100)}% approval rate`,
            metadata:    monthlyReport as never,
          },
        });
        console.info(`  Override monthly report generated for ${monthlyReport.period} (${monthlyReport.totalRequested} records)`);

        // ── Process 14: Monthly board pack PDF ───────────────
        try {
          const tenantRecord = await prisma.tenant.findUnique({
            where: { id: tenant.id },
            select: { name: true },
          });
          const packData = await AnalyticsService.getBoardPackData(tenant.id, prevMonth, prevYear);
          const html     = renderBoardPackHtml({ ...packData, tenantName: tenantRecord?.name ?? tenant.name });
          const pdf      = await pdfService.renderToPdf(html, { format: "A4" });

          // Log to ActivityLog so it appears in the board-pack page history
          await prisma.activityLog.create({
            data: {
              entityType:  "SYSTEM",
              entityId:    tenant.id,
              action:      "BOARD_PACK_GENERATED",
              description: `Monthly board pack auto-generated for ${packData.period} (${packData.schemeGrid.length} schemes)`,
              metadata:    {
                period:       packData.period,
                schemeCount:  packData.schemeGrid.length,
                generatedAt:  packData.generatedAt,
                sizeBytes:    pdf.length,
              } as never,
            },
          });
          console.info(`  Board pack PDF generated for ${packData.period} (${(pdf.length / 1024).toFixed(0)} KB)`);
        } catch (boardPackErr) {
          // Board pack failure is non-critical — log and continue
          console.error(`  Board pack generation failed for ${tenant.name}:`, boardPackErr);
        }
      }
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
