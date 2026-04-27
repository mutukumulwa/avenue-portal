import { Worker, Job } from "bullmq";
import { connection, scheduleEscalationJob, scheduleDailyJobs } from "../../lib/queue";
import { NotificationService } from "../services/notification.service";
import { runPreauthEscalationJob } from "./preauth-escalation.job";
import { runRenewalReminderJob } from "./renewal-reminder.job";
import { runSuspensionCheckJob } from "./suspension-check.job";

console.log("Starting background workers...");

// Register recurring scheduled jobs (idempotent — BullMQ deduplicates by jobId)
scheduleEscalationJob().catch(err => console.error("[Worker] Failed to schedule escalation job:", err));
scheduleDailyJobs().catch(err => console.error("[Worker] Failed to schedule daily jobs:", err));

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
}, { connection });

billingWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Billing job ${job?.id} failed:`, err);
});

/**
 * SYSTEM WORKER
 * Daily jobs: renewal reminders + suspension checks
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

// Process exit handling loop
process.on("SIGTERM", async () => {
  console.log("Gracefully closing workers...");
  await notificationWorker.close();
  await billingWorker.close();
  await systemWorker.close();
  await clinicalWorker.close();
});
