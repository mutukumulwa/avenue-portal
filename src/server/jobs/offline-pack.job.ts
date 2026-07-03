/**
 * offline-pack.job.ts (WP-B3/B4)
 * Daily sweep for the offline-work workflow:
 *   1. Expire lapsed offline work codes (ACTIVE past validUntil → EXPIRED).
 *   2. Regenerate the encrypted facility data pack for every facility still
 *      holding an ACTIVE code, so the data a facility can download while
 *      connected is never older than a day.
 *
 * Triggered by: daily cron (scheduleDailyJobs in queue.ts).
 */

import { OfflineAuthService } from "../services/offline-auth.service";
import { OfflinePackService } from "../services/offline-pack.service";
import { HmsBatchService } from "../services/hms-batch.service";

export async function runOfflinePackJob() {
  console.info("[offline-pack] Expiring lapsed offline work codes…");
  const expired = await OfflineAuthService.expireLapsed();
  console.info(`[offline-pack] ${expired} code(s) expired.`);

  console.info("[offline-pack] Regenerating packs for facilities with active codes…");
  const { total, regenerated } = await OfflinePackService.regenerateActivePacks();
  console.info(`[offline-pack] ${regenerated}/${total} pack(s) regenerated.`);

  // WP-D4: daily HMS batch poll slot (push API is the primary channel).
  const poll = await HmsBatchService.pollConfiguredEndpoints();
  console.info(`[offline-pack] HMS poll: ${poll.polled} endpoint(s) — ${poll.note}.`);
}
