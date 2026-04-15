import { Worker, Job } from "bullmq";
import { connection } from "../../lib/queue";
import { NotificationService } from "../services/notification.service";

console.log("Starting background workers...");

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

// Process exit handling loop
process.on("SIGTERM", async () => {
  console.log("Gracefully closing workers...");
  await notificationWorker.close();
  await billingWorker.close();
});
