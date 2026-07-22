/**
 * Claims Autopilot — processing-run lease + stage repository (F3.5).
 *
 * The database run/stage rows are authoritative (D8). One worker safely claims a
 * due run via `FOR UPDATE SKIP LOCKED`; only the lease owner may transition it;
 * transitions are conditional so a late/non-owner writer changes nothing and a
 * terminal run is immutable. Transient failures reuse the run (RETRYABLE);
 * an authorized reprocess creates the next sequence with a supersession link and
 * can never create two non-terminal runs for one revision (the DB unique on
 * (claimId, claimRevision, workflowVersion, sequence) enforces it).
 */
import { Prisma, type PrismaClient, type ClaimProcessingStageName, type ClaimProcessingStageState, type ClaimProcessingTrigger } from "@prisma/client";

type Db = PrismaClient;

const DEFAULT_LEASE_SECONDS = 120;
const NON_TERMINAL: Prisma.ClaimProcessingRunWhereInput["state"] = { in: ["PENDING", "RUNNING", "RETRYABLE"] };

export interface ClaimedRun {
  id: string;
  claimId: string;
  tenantId: string;
  claimRevision: number;
  workflowVersion: string;
  sequence: number;
  attemptCount: number;
}

/** One-line, stack-free error text safe to persist in run/stage rows (§F3.5 step 7). */
export function safeErrorMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 300);
}

function leaseExpiry(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Atomically claim the oldest due run (PENDING, due RETRYABLE, or a stale-leased
 * RUNNING) for this worker. Two workers running this concurrently never claim the
 * same run (`FOR UPDATE SKIP LOCKED`). Returns the claimed run or null.
 */
export async function claimNextRun(db: Db, opts: { leaseOwner: string; leaseSeconds?: number }): Promise<ClaimedRun | null> {
  // Prisma stores DateTime as UTC in a `timestamp` (no tz) column; compare/compute
  // against `now() AT TIME ZONE 'UTC'` so the DB session timezone can't skew leases.
  const secs = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const rows = await db.$queryRaw<ClaimedRun[]>`
    UPDATE "ClaimProcessingRun" AS r
    SET "state" = 'RUNNING'::"ClaimProcessingState",
        "leaseOwner" = ${opts.leaseOwner},
        "leaseExpiresAt" = (now() AT TIME ZONE 'UTC') + (${secs} * interval '1 second'),
        "startedAt" = COALESCE(r."startedAt", (now() AT TIME ZONE 'UTC')),
        "attemptCount" = r."attemptCount" + 1,
        "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE r."id" = (
      SELECT c."id" FROM "ClaimProcessingRun" c
      WHERE c."state" = 'PENDING'
         OR (c."state" = 'RETRYABLE' AND (c."nextAttemptAt" IS NULL OR c."nextAttemptAt" <= (now() AT TIME ZONE 'UTC')))
         OR (c."state" = 'RUNNING' AND c."leaseExpiresAt" IS NOT NULL AND c."leaseExpiresAt" < (now() AT TIME ZONE 'UTC'))
      ORDER BY c."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING r."id", r."claimId", r."tenantId", r."claimRevision", r."workflowVersion", r."sequence", r."attemptCount"`;
  return rows[0] ?? null;
}

/**
 * Claim a SPECIFIC run by id (direct dispatch from the enqueue). Uses the same
 * `FOR UPDATE SKIP LOCKED` inner select as `claimNextRun` so two workers racing
 * on one run can never both win — the loser's inner select skips the locked row
 * and updates nothing.
 */
export async function claimRunById(db: Db, runId: string, opts: { leaseOwner: string; leaseSeconds?: number }): Promise<ClaimedRun | null> {
  const secs = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const rows = await db.$queryRaw<ClaimedRun[]>`
    UPDATE "ClaimProcessingRun" AS r
    SET "state" = 'RUNNING'::"ClaimProcessingState",
        "leaseOwner" = ${opts.leaseOwner},
        "leaseExpiresAt" = (now() AT TIME ZONE 'UTC') + (${secs} * interval '1 second'),
        "startedAt" = COALESCE(r."startedAt", (now() AT TIME ZONE 'UTC')),
        "attemptCount" = r."attemptCount" + 1,
        "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE r."id" = (
      SELECT c."id" FROM "ClaimProcessingRun" c
      WHERE c."id" = ${runId}
        AND (
          c."state" = 'PENDING'
          OR (c."state" = 'RETRYABLE' AND (c."nextAttemptAt" IS NULL OR c."nextAttemptAt" <= (now() AT TIME ZONE 'UTC')))
          OR (c."state" = 'RUNNING' AND c."leaseExpiresAt" IS NOT NULL AND c."leaseExpiresAt" < (now() AT TIME ZONE 'UTC'))
        )
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING r."id", r."claimId", r."tenantId", r."claimRevision", r."workflowVersion", r."sequence", r."attemptCount"`;
  return rows[0] ?? null;
}

/** Extend the lease if still owned (long-running processing). */
export async function extendLease(db: Db, runId: string, leaseOwner: string, leaseSeconds = DEFAULT_LEASE_SECONDS): Promise<boolean> {
  const res = await db.claimProcessingRun.updateMany({
    where: { id: runId, leaseOwner, state: "RUNNING" },
    data: { leaseExpiresAt: leaseExpiry(leaseSeconds) },
  });
  return res.count === 1;
}

/** Upsert a named stage under (runId, stage). Increments attempts on re-run. */
export async function recordStage(
  db: Db,
  runId: string,
  stage: ClaimProcessingStageName,
  data: { state: ClaimProcessingStageState; reasonCode?: string | null; safeMessage?: string | null; result?: Prisma.InputJsonValue; durationMs?: number | null; currentStage?: boolean },
): Promise<void> {
  const now = new Date();
  await db.claimProcessingStage.upsert({
    where: { runId_stage: { runId, stage } },
    create: {
      runId, stage, state: data.state, attemptCount: 1,
      reasonCode: data.reasonCode ?? null, safeMessage: data.safeMessage ?? null,
      result: data.result ?? Prisma.JsonNull, durationMs: data.durationMs ?? null,
      startedAt: now, completedAt: data.state === "RUNNING" ? null : now,
    },
    update: {
      state: data.state, attemptCount: { increment: 1 },
      reasonCode: data.reasonCode ?? null, safeMessage: data.safeMessage ?? null,
      result: data.result ?? Prisma.JsonNull, durationMs: data.durationMs ?? null,
      completedAt: data.state === "RUNNING" ? null : now,
    },
  });
  if (data.currentStage) {
    await db.claimProcessingRun.updateMany({ where: { id: runId }, data: { currentStage: stage } });
  }
}

interface TerminalData {
  routeCode?: string | null;
  assignedQueue?: string | null;
  safeMessage?: string | null;
  modeResolved?: string | null;
  policyId?: string | null;
}

/** Conditional terminal transition: only the RUNNING lease owner may apply it. */
async function terminate(db: Db, runId: string, leaseOwner: string, state: "ROUTED" | "SHADOW_COMPLETE" | "AUTO_DECIDED" | "FAILED", data: TerminalData): Promise<boolean> {
  const res = await db.claimProcessingRun.updateMany({
    where: { id: runId, leaseOwner, state: "RUNNING" },
    data: {
      state,
      routeCode: data.routeCode ?? undefined,
      assignedQueue: data.assignedQueue ?? undefined,
      safeMessage: data.safeMessage ?? undefined,
      modeResolved: data.modeResolved ?? undefined,
      policyId: data.policyId ?? undefined,
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  return res.count === 1;
}

export const markRunRouted = (db: Db, runId: string, owner: string, data: TerminalData) => terminate(db, runId, owner, "ROUTED", data);
export const markRunShadowComplete = (db: Db, runId: string, owner: string, data: TerminalData) => terminate(db, runId, owner, "SHADOW_COMPLETE", data);
export const markRunAutoDecided = (db: Db, runId: string, owner: string, data: TerminalData) => terminate(db, runId, owner, "AUTO_DECIDED", data);

/** Transient failure: reuse the run, retry after nextAttemptAt. */
export async function markRunRetryable(db: Db, runId: string, leaseOwner: string, data: { safeMessage?: string | null; nextAttemptAt: Date }): Promise<boolean> {
  const res = await db.claimProcessingRun.updateMany({
    where: { id: runId, leaseOwner, state: "RUNNING" },
    data: { state: "RETRYABLE", safeMessage: data.safeMessage ?? undefined, nextAttemptAt: data.nextAttemptAt, leaseOwner: null, leaseExpiresAt: null },
  });
  return res.count === 1;
}

/** Exhausted / unrecoverable technical failure (operator-visible). */
export function markRunFailed(db: Db, runId: string, owner: string, data: { safeMessage?: string | null }): Promise<boolean> {
  return terminate(db, runId, owner, "FAILED", { safeMessage: data.safeMessage });
}

export interface ReprocessResult {
  runId: string;
  sequence: number;
  created: boolean;
}

/**
 * Create the next-sequence run for an authorized reprocess, linking the prior
 * terminal run as superseded. Idempotent under concurrency: if a non-terminal run
 * already exists (or a concurrent reprocess wins the sequence unique), the
 * existing run is returned and no second non-terminal run is created.
 */
export async function createReprocessRun(
  db: Db,
  input: { tenantId: string; claimId: string; receiptId: string; claimRevision: number; workflowVersion?: string; trigger: ClaimProcessingTrigger },
): Promise<ReprocessResult> {
  const workflowVersion = input.workflowVersion ?? "v1";
  const scope = { claimId: input.claimId, claimRevision: input.claimRevision, workflowVersion };

  const existingNonTerminal = await db.claimProcessingRun.findFirst({ where: { ...scope, state: NON_TERMINAL }, select: { id: true, sequence: true } });
  if (existingNonTerminal) return { runId: existingNonTerminal.id, sequence: existingNonTerminal.sequence, created: false };

  const max = await db.claimProcessingRun.aggregate({ where: scope, _max: { sequence: true } });
  const priorSeq = max._max.sequence ?? 0;
  const nextSequence = priorSeq + 1;
  const prior = priorSeq > 0 ? await db.claimProcessingRun.findFirst({ where: { ...scope, sequence: priorSeq }, select: { id: true } }) : null;

  try {
    const run = await db.claimProcessingRun.create({
      data: {
        tenantId: input.tenantId, claimId: input.claimId, receiptId: input.receiptId,
        claimRevision: input.claimRevision, workflowVersion, sequence: nextSequence,
        trigger: input.trigger, supersedesRunId: prior?.id ?? null, state: "PENDING",
      },
      select: { id: true, sequence: true },
    });
    return { runId: run.id, sequence: run.sequence, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await db.claimProcessingRun.findFirst({ where: { ...scope, sequence: nextSequence }, select: { id: true, sequence: true } });
      if (winner) return { runId: winner.id, sequence: winner.sequence, created: false };
    }
    throw err;
  }
}
