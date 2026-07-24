import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

/**
 * PNOS F5.4 — backfill existing claims into self-rooted submission chains.
 *
 * Every claim with a null chainRootClaimId becomes the head of its own chain
 * (chainRootClaimId = own id). New claims are self-rooted at intake (persist.ts), so
 * this is a one-time migration for pre-F5.4 rows. It is BATCHED, IDEMPOTENT (only
 * null rows are touched — processed rows drop out of the filter, so the loop advances
 * without a cursor and a re-run is a no-op) and RESUMABLE. dryRun reports scale
 * without writing. NOT a status write (chainRootClaimId only) — mutation guard unaffected.
 */
export interface BackfillOriginalChainsResult {
  scanned: number;
  updated: number;
  batches: number;
  dryRun: boolean;
}

export async function backfillOriginalChains(
  opts: { tenantId?: string; batchSize?: number; dryRun?: boolean } = {},
  db: PrismaClient = prisma,
): Promise<BackfillOriginalChainsResult> {
  const batchSize = opts.batchSize ?? 500;
  const where = { chainRootClaimId: null, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) };

  if (opts.dryRun) {
    return { scanned: await db.claim.count({ where }), updated: 0, batches: 0, dryRun: true };
  }

  let updated = 0;
  let batches = 0;
  for (;;) {
    const rows = await db.claim.findMany({ where, select: { id: true }, take: batchSize });
    if (rows.length === 0) break;
    batches++;
    // A single updateMany cannot set a per-row value (chainRootClaimId = own id), so
    // update each. Only null rows match, so this is safe to interrupt/resume.
    await Promise.all(rows.map((r) => db.claim.update({ where: { id: r.id }, data: { chainRootClaimId: r.id } })));
    updated += rows.length;
    if (rows.length < batchSize) break;
  }
  return { scanned: updated, updated, batches, dryRun: false };
}
