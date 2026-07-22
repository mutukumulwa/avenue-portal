/**
 * Claims Autopilot — processing timeline + reconciliation queries (F3.7).
 *
 * The timeline gives claim detail (F6.3) a complete, PHI-safe trace. The
 * reconciliation queries surface the §11.7 "impossible states" for the
 * operations integrity report (F7.2 assembles the full report; these are the
 * building blocks). All read-only.
 */
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;
const scope = (tenantId?: string) => (tenantId ? { tenantId } : {});

export async function getClaimProcessingTimeline(db: Db, tenantId: string, claimId: string) {
  const [receipts, runs, audit] = await Promise.all([
    db.claimIntakeReceipt.findMany({
      where: { tenantId, claimId },
      orderBy: { createdAt: "asc" },
      select: { id: true, channel: true, state: true, outcomeCode: true, createdAt: true, completedAt: true, replayedFromReceiptId: true },
    }),
    db.claimProcessingRun.findMany({
      where: { tenantId, claimId },
      orderBy: [{ claimRevision: "asc" }, { sequence: "asc" }],
      include: { stages: { orderBy: [{ startedAt: "asc" }], select: { stage: true, state: true, reasonCode: true, durationMs: true, startedAt: true, completedAt: true } } },
    }),
    db.auditLog.findMany({
      where: { tenantId, entityType: "Claim", entityId: claimId, action: { startsWith: "CLAIM:" } },
      orderBy: { createdAt: "asc" },
      select: { action: true, description: true, createdAt: true },
    }),
  ]);
  return { receipts, runs, audit };
}

/** Accepted receipt ⇒ exactly one linked claim: a SUCCEEDED receipt with no claim. */
export function findAcceptedReceiptsWithoutClaim(db: Db, tenantId?: string) {
  return db.claimIntakeReceipt.findMany({
    where: { ...scope(tenantId), state: "SUCCEEDED", claimId: null },
    select: { id: true, tenantId: true, channel: true, createdAt: true },
  });
}

/** Successful claim ⇒ a processing run: a claim with an intake receipt but no run. */
export function findClaimsWithoutRun(db: Db, tenantId?: string) {
  return db.claim.findMany({
    where: { ...scope(tenantId), intakeReceipts: { some: {} }, processingRuns: { none: {} } },
    select: { id: true, claimNumber: true, tenantId: true },
  });
}

/** Non-terminal runs older than the threshold — stuck (worker down / poison). */
export function findStuckRuns(db: Db, olderThanMinutes: number, tenantId?: string) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  return db.claimProcessingRun.findMany({
    where: { ...scope(tenantId), state: { in: ["PENDING", "RUNNING", "RETRYABLE"] }, createdAt: { lt: cutoff } },
    select: { id: true, claimId: true, state: true, attemptCount: true, createdAt: true },
  });
}

const TERMINAL_AUDIT_ACTIONS = [
  "CLAIM:AUTOPILOT_ROUTED",
  "CLAIM:AUTOPILOT_SHADOW_PROPOSED",
  "CLAIM:AUTO_APPROVED",
  "CLAIM:AUTO_PARTIALLY_APPROVED",
  "CLAIM:AUTOPILOT_RETRY_EXHAUSTED",
];

/** Terminal run whose claim has no corresponding autopilot audit event. */
export async function findTerminalRunsWithoutAudit(db: Db, tenantId?: string) {
  const terminal = await db.claimProcessingRun.findMany({
    where: { ...scope(tenantId), state: { in: ["ROUTED", "SHADOW_COMPLETE", "AUTO_DECIDED", "FAILED"] } },
    select: { id: true, claimId: true, tenantId: true, state: true },
  });
  const offenders: typeof terminal = [];
  for (const r of terminal) {
    const auditCount = await db.auditLog.count({
      where: { tenantId: r.tenantId, entityType: "Claim", entityId: r.claimId, action: { in: TERMINAL_AUDIT_ACTIONS } },
    });
    if (auditCount === 0) offenders.push(r);
  }
  return offenders;
}
