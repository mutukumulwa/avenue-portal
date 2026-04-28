import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Shared Redis connection for queues (reused to avoid socket exhaustion)
export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Define core system queues
export const Queues = {
  notifications: new Queue("notifications", { connection }),
  billing:       new Queue("billing",       { connection }),
  clinical:      new Queue("clinical",      { connection }),
  system:        new Queue("system",        { connection }),
};

/**
 * Schedule the pre-auth escalation scan to run every 30 minutes.
 * Call once at worker startup — BullMQ deduplicates by jobId.
 */
export async function scheduleEscalationJob() {
  await Queues.clinical.add(
    "preauth-escalation",
    {},
    {
      repeat:   { every: 30 * 60 * 1000 }, // 30 minutes
      jobId:    "preauth-escalation-recurring",
      attempts: 2,
    },
  );
}

/**
 * Schedule daily system jobs (renewal reminders + suspension checks).
 * Runs at 06:00 EAT daily — BullMQ deduplicates by jobId.
 */
export async function scheduleDailyJobs() {
  const SIX_AM_CRON = "0 6 * * *";
  await Promise.all([
    Queues.system.add(
      "renewal-reminders",
      {},
      { repeat: { pattern: SIX_AM_CRON }, jobId: "renewal-reminders-daily", attempts: 2 },
    ),
    Queues.system.add(
      "suspension-check",
      {},
      { repeat: { pattern: SIX_AM_CRON }, jobId: "suspension-check-daily", attempts: 2 },
    ),
    Queues.system.add(
      "fund-balance-alert",
      {},
      { repeat: { pattern: SIX_AM_CRON }, jobId: "fund-balance-alert-daily", attempts: 2 },
    ),
  ]);
}

/**
 * Enqueue an email to be sent asynchronously.
 */
export async function enqueueEmail(payload: { to: string; subject: string; body: string; html?: string; correspondenceId?: string }) {
  await Queues.notifications.add("send-email", payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

/**
 * Trigger background billing computations (e.g. Endorsement sweeps)
 */
export async function enqueueBillingRun(groupId: string) {
  await Queues.billing.add("reconcile-billing", { groupId }, {
    attempts: 1, // Let ops see failure
  });
}
