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
  analytics:     new Queue("analytics",     { connection }),
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
 * Schedule broker commission reconciliation after the normal billing window.
 * Runs at 02:00 EAT daily — BullMQ deduplicates by jobId.
 */
export async function scheduleCommissionReconciliationJob() {
  await Queues.billing.add(
    "reconcile-commissions",
    {},
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "commission-reconciliation-daily",
      attempts: 2,
    },
  );
}

/**
 * Schedule report generation — daily at 06:00 EAT (03:00 UTC).
 * Includes: weekly reports + daily override compliance summary + 1st-of-month override report.
 */
export async function scheduleReportGenerationJob() {
  await Queues.system.add(
    "report-generation",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "report-generation-daily", attempts: 2 },
  );
}

/**
 * Schedule lapse detection — daily at 23:00 EAT (20:00 UTC).
 */
export async function scheduleLapseDetectionJob() {
  await Queues.system.add(
    "lapse-detection",
    {},
    { repeat: { pattern: "0 20 * * *" }, jobId: "lapse-detection-daily", attempts: 2 },
  );
}

/**
 * Schedule membership activation — daily at 00:01 EAT (21:01 UTC).
 */
export async function scheduleMembershipActivationJob() {
  await Queues.system.add(
    "membership-activation",
    {},
    { repeat: { pattern: "1 21 * * *" }, jobId: "membership-activation-daily", attempts: 2 },
  );
}

/**
 * Schedule quotation expiry check — daily at 01:00 EAT.
 */
export async function scheduleQuotationExpiryJob() {
  await Queues.system.add(
    "quotation-expiry",
    {},
    { repeat: { pattern: "0 1 * * *" }, jobId: "quotation-expiry-daily", attempts: 2 },
  );
}

/**
 * Schedule intake-allocation (every 10 min) and SLA-breach checks (every 30 min).
 */
export async function scheduleIntakeJobs() {
  await Promise.all([
    Queues.system.add(
      "intake-allocation",
      {},
      { repeat: { every: 10 * 60 * 1000 }, jobId: "intake-allocation-recurring", attempts: 2 },
    ),
    Queues.system.add(
      "sla-breach-check",
      {},
      { repeat: { every: 30 * 60 * 1000 }, jobId: "sla-breach-check-recurring", attempts: 2 },
    ),
  ]);
}

/**
 * Refresh strategic purchasing analytics facts and lightweight derived data.
 * Runs every 15 minutes so dashboards can read from analytics tables.
 */
export async function scheduleAnalyticsRefreshJob() {
  await Queues.analytics.add(
    "refresh-foundation",
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: "analytics-refresh-foundation-recurring",
      attempts: 2,
    },
  );
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

export async function enqueueCommissionReconciliation(period?: string) {
  await Queues.billing.add("reconcile-commissions", { period }, {
    attempts: 1,
  });
}

export async function enqueueAnalyticsRefresh(payload: { tenantId?: string } = {}) {
  await Queues.analytics.add("refresh-foundation", payload, {
    attempts: 1,
  });
}
