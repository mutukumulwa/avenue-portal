import { Worker, Job } from "bullmq";
import { connection, scheduleEscalationJob, scheduleDailyJobs, scheduleCommissionReconciliationJob, scheduleAnalyticsRefreshJob, scheduleIntakeJobs, scheduleQuotationExpiryJob, scheduleMembershipActivationJob, scheduleLapseDetectionJob, scheduleReportGenerationJob, scheduleAdminFeeAccrualJob, scheduleFraudScanJob } from "../../lib/queue";
import { NotificationService } from "../services/notification.service";
import { runPreauthEscalationJob } from "./preauth-escalation.job";
import { runRenewalReminderJob }    from "./renewal-reminder.job";
import { runSuspensionCheckJob }    from "./suspension-check.job";
import { runFundBalanceAlertJob }   from "./fund-balance-alert.job";
import { runCommissionReconciliationJob } from "./commission-reconciliation.job";
import { runAnalyticsRefreshJob } from "./analytics-refresh.job";
import { runIntakeAllocationJob } from "./intake-allocation.job";
import { runMembershipActivationJob } from "./membership-activation.job";
import { runSlaBreachJob } from "./sla-breach.job";
import { runApprovalEscalationJob } from "./approval-escalation.job";
import { SyncService } from "../services/sync.service";
import { runQuotationExpiryJob } from "./quotation-expiry.job";
import { runLapseDetectionJob } from "./lapse-detection.job";
import { runAdminFeeAccrualJob } from "./admin-fee-accrual.job";
import { runFraudScanJob } from "./fraud-scan.job";
import { runContractLifecycleJob } from "./contract-lifecycle.job";

console.log("Starting background workers...");

// Register recurring scheduled jobs (idempotent — BullMQ deduplicates by jobId)
scheduleEscalationJob().catch(err => console.error("[Worker] Failed to schedule escalation job:", err));
scheduleDailyJobs().catch(err => console.error("[Worker] Failed to schedule daily jobs:", err));
scheduleCommissionReconciliationJob().catch(err => console.error("[Worker] Failed to schedule commission reconciliation job:", err));
scheduleAnalyticsRefreshJob().catch(err => console.error("[Worker] Failed to schedule analytics refresh job:", err));
scheduleIntakeJobs().catch(err => console.error("[Worker] Failed to schedule intake jobs:", err));
scheduleQuotationExpiryJob().catch(err => console.error("[Worker] Failed to schedule quotation expiry job:", err));
scheduleMembershipActivationJob().catch(err => console.error("[Worker] Failed to schedule membership activation job:", err));
scheduleLapseDetectionJob().catch(err => console.error("[Worker] Failed to schedule lapse detection job:", err));
scheduleReportGenerationJob().catch(err => console.error("[Worker] Failed to schedule report generation job:", err));
scheduleAdminFeeAccrualJob().catch(err => console.error("[Worker] Failed to schedule admin-fee accrual job:", err));
scheduleFraudScanJob().catch(err => console.error("[Worker] Failed to schedule fraud-scan job:", err));

/**
 * NOTIFICATIONS WORKER
 * Processes generic outbound emails via Nodemailer
 */
const notificationWorker = new Worker("notifications", async (job: Job) => {
  if (job.name === "send-email") {
    console.log(`[Worker] Preparing to send email to ${job.data.to}`);
    await NotificationService.executeEmailDispatch(job.data as { to: string; subject: string; body: string; html?: string; correspondenceId?: string });
    console.log(`[Worker] Successfully sent email to ${job.data.to}`);
  }
}, { connection });

notificationWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Notification job ${job?.id} failed:`, err);
});

/**
 * BILLING WORKER
 * Safe isolated background processor for large financial aggregations
 */
const billingWorker = new Worker("billing", async (job: Job) => {
  if (job.name === "reconcile-billing") {
    console.log(`[Worker] Reconciling billing for group ${job.data.groupId}`);
    // Await BillingService.recalculateGroup...
  }
  if (job.name === "reconcile-commissions") {
    const result = await runCommissionReconciliationJob(job.data.period);
    console.log(`[Worker] Commission reconciliation complete for ${result.period}`);
  }
  if (job.name === "admin-fee-accrual") {
    const result = await runAdminFeeAccrualJob();
    console.log(`[Worker] Admin-fee accrual complete — ${result.entriesWritten} entr(ies) for ${result.period}`);
  }
}, { connection });

billingWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Billing job ${job?.id} failed:`, err);
});

/**
 * SYSTEM WORKER
 * Daily jobs: renewal reminders, suspension checks, intake allocation, SLA breach.
 */
const systemWorker = new Worker("system", async (job: Job) => {
  if (job.name === "renewal-reminders") {
    console.log("[Worker] Running renewal reminders...");
    await runRenewalReminderJob();
  }
  if (job.name === "suspension-check") {
    console.log("[Worker] Running suspension check...");
    await runSuspensionCheckJob();
  }
  if (job.name === "fund-balance-alert") {
    console.log("[Worker] Running fund balance alerts...");
    await runFundBalanceAlertJob();
  }
  if (job.name === "intake-allocation") {
    const result = await runIntakeAllocationJob();
    console.log(`[Worker] Intake allocation complete — ${result.totalAllocated} quotation(s) allocated`);
  }
  if (job.name === "sla-breach-check") {
    const result = await runSlaBreachJob();
    console.log(`[Worker] SLA breach check complete — ${result.breachedCount} breach(es) flagged`);
  }
  if (job.name === "approval-escalation-check") {
    const result = await runApprovalEscalationJob();
    console.log(`[Worker] Approval escalation check complete — ${result.escalatedCount} escalated`);
  }
  if (job.name === "sync-reconcile") {
    const { state } = await SyncService.reconcile(job.data.operationId as string);
    console.log(`[Worker] Sync reconcile ${job.data.operationId} → ${state}`);
  }
  if (job.name === "quotation-expiry") {
    const result = await runQuotationExpiryJob();
    console.log(`[Worker] Quotation expiry check complete — ${result.totalExpired} expired`);
  }
  if (job.name === "membership-activation") {
    const result = await runMembershipActivationJob();
    console.log(`[Worker] Membership activation complete — ${result.totalActivated} activated, ${result.totalLapsed} lapsed`);
  }
  if (job.name === "lapse-detection") {
    const result = await runLapseDetectionJob();
    console.log(`[Worker] Lapse detection complete — ${result.totalLapsed} lapsed, ${result.totalExpired} catch-up windows expired`);
  }
  if (job.name === "report-generation") {
    const { runReportGenerationJob } = await import("./report-generation.job");
    await runReportGenerationJob();
    console.log("[Worker] Report generation complete");
  }
  if (job.name === "fraud-scan") {
    const result = await runFraudScanJob();
    console.log(`[Worker] Fraud scan complete — ${result.totalAlerts} alert(s) over ${result.totalScanned} claim(s)`);
  }
  if (job.name === "contract-lifecycle") {
    const result = await runContractLifecycleJob();
    console.log(`[Worker] Contract lifecycle complete — ${result.activated} activated, ${result.expired} expired, ${result.reswept} re-swept`);
  }
}, { connection });

systemWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] System job ${job?.id} failed:`, err);
});

/**
 * CLINICAL WORKER
 * Handles pre-auth escalation and other clinical operations
 */
const clinicalWorker = new Worker("clinical", async (job: Job) => {
  if (job.name === "preauth-escalation") {
    const count = await runPreauthEscalationJob();
    console.log(`[Worker] Escalation complete — ${count} pre-auth(s) escalated`);
  }
}, { connection });

clinicalWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Clinical job ${job?.id} failed:`, err);
});

/**
 * ANALYTICS WORKER
 * Keeps read-optimized strategic purchasing facts fresh for dashboards.
 */
const analyticsWorker = new Worker("analytics", async (job: Job) => {
  if (job.name === "refresh-foundation") {
    await runAnalyticsRefreshJob(job.data as { tenantId?: string });
  }
}, { connection });

analyticsWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Analytics job ${job?.id} failed:`, err);
});

// Process exit handling loop
process.on("SIGTERM", async () => {
  console.log("Gracefully closing workers...");
  await notificationWorker.close();
  await billingWorker.close();
  await systemWorker.close();
  await clinicalWorker.close();
  await analyticsWorker.close();
});
