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
  billing: new Queue("billing", { connection }),
  system: new Queue("system", { connection }),
};

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
