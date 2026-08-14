import { prisma } from "../../lib/prisma";
import { MemberImportJobService, type ReapOutcome } from "../services/member-import-job.service";

export type ImportReaperResult = {
  batches: number;
  recovered: number;
  abandoned: number;
  /** Batches still UNKNOWN after reaping — these need a person, not another sweep. */
  unresolved: number;
};

/**
 * Sweep member imports that stopped without finishing.
 *
 * A crash between `createMember` and `finishRow` leaves the batch PROCESSING
 * and `finalize` uncalled, and `reserve` then refuses to replay it forever —
 * the idempotency key hashes the file's content, so that file is locked out of
 * that group permanently. This is the sweep that unlocks it, by RECONCILING
 * rather than guessing: see `MemberImportJobService.reap`.
 *
 * Every-15-minutes rather than every minute, unlike the claim-autopilot
 * recovery it sits beside. That sweep re-drives work that is meant to complete;
 * this one only acts on batches already declared stale, and acting sooner would
 * just race an import that is still legitimately running.
 *
 * NOTE: the worker is not provisioned in production. Until it is, this job does
 * not run anywhere, and `scripts/reap-stuck-imports.ts` is the operative path —
 * it needs nothing but DATABASE_URL.
 */
export async function runMemberImportReaperJob(
  opts: { staleAfterMs?: number; limit?: number } = {},
): Promise<ImportReaperResult> {
  const outcomes: ReapOutcome[] = await MemberImportJobService.reap(prisma, opts);

  const result = outcomes.reduce<ImportReaperResult>(
    (total, o) => ({
      batches: total.batches + 1,
      recovered: total.recovered + o.recovered,
      abandoned: total.abandoned + o.abandoned,
      unresolved: total.unresolved + (o.status === "UNKNOWN" ? 1 : 0),
    }),
    { batches: 0, recovered: 0, abandoned: 0, unresolved: 0 },
  );

  // Each reaped batch is worth a line: a recovered row means a member existed
  // that the ledger had no record of, which is the case worth noticing.
  for (const o of outcomes) {
    console.log(
      `[Worker] import-reaper ${o.batchRef} [${o.lane}] → ${o.status} ` +
        `(recovered ${o.recovered}, abandoned ${o.abandoned}, inconclusive ${o.inconclusive})`,
    );
  }

  return result;
}
