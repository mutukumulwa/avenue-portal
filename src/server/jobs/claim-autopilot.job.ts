/**
 * Claims Autopilot — processing job + recovery sweeper (F3.6).
 *
 * `claim-autopilot-run` processes ONE accepted run (claim it, run the processor,
 * apply the terminal/retry transition). `claim-autopilot-recovery` sweeps
 * PENDING / due-RETRYABLE / stale-leased runs so accepted claims process even
 * when the enqueue or a worker was interrupted (D8 — the DB lease is
 * authoritative; BullMQ only accelerates).
 *
 * The actual read-only stage evaluation is registered by F4.2 via
 * `setClaimProcessor`. Until then the fail-closed default routes every claim to
 * manual adjudication (no automation ⇒ a human decides, D1).
 */
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  claimRunById,
  claimNextRun,
  markRunRouted,
  markRunShadowComplete,
  markRunAutoDecided,
  markRunRetryable,
  markRunFailed,
  safeErrorMessage,
  type ClaimedRun,
} from "@/server/services/claim-intake/processing";
import { auditChainService } from "@/server/services/audit-chain.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { getReason, type RouteCode } from "@/server/services/claim-intake/reason-catalog";

export const MAX_RUN_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 30_000;

export type ProcessorOutcome =
  | { kind: "ROUTED"; routeCode: string; assignedQueue?: string | null; safeMessage?: string; modeResolved?: string | null; policyId?: string | null }
  | { kind: "SHADOW_COMPLETE"; routeCode?: string | null; assignedQueue?: string | null; safeMessage?: string; modeResolved?: string | null; policyId?: string | null }
  | { kind: "AUTO_DECIDED"; safeMessage?: string; modeResolved?: string | null; policyId?: string | null }
  | { kind: "RETRY"; safeMessage?: string; delayMs?: number };

export type ClaimProcessor = (db: PrismaClient, run: ClaimedRun) => Promise<ProcessorOutcome>;

/** Fail-closed default: route everything to manual until F4.2 registers the evaluator. */
const defaultProcessor: ClaimProcessor = async () => ({ kind: "ROUTED", routeCode: "AUTO_POLICY_NOT_LIVE", assignedQueue: "MANUAL_ADJUDICATION" });

let processor: ClaimProcessor = defaultProcessor;
export function setClaimProcessor(fn: ClaimProcessor): void {
  processor = fn;
}
export function resetClaimProcessor(): void {
  processor = defaultProcessor;
}

const WORKER_OWNER = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

async function mirrorToClaim(
  db: PrismaClient,
  claimId: string,
  processingState: "ROUTED" | "SHADOW_COMPLETE" | "AUTO_DECIDED" | "FAILED",
  routeCode: string | null,
  assignedQueue: string | null,
): Promise<void> {
  await db.claim
    .update({
      where: { id: claimId },
      data: {
        processingState,
        processingRouteCode: routeCode ?? undefined,
        ...(assignedQueue ? { assignedQueue } : {}),
      },
    })
    .catch(() => undefined);
}

/**
 * Exact-once terminal effects (audit + member notification). Called ONLY when a
 * terminal transition actually applied (`markRun*` returned true), which happens
 * at most once per run — so these effects fire exactly once even under retries or
 * two workers (F3.7, §11.4). Both are best-effort and never fail processing.
 */
async function onTerminal(db: PrismaClient, run: ClaimedRun, action: string, routeCode: string | null): Promise<void> {
  try {
    const actorId = await getSystemActorId(run.tenantId);
    await auditChainService.append({
      actorId, action, module: "CLAIMS", entityType: "Claim", entityId: run.claimId,
      payload: { runId: run.id, sequence: run.sequence, routeCode }, tenantId: run.tenantId,
      description: `${action} — run ${run.id} (claim ${run.claimId})`,
    });
  } catch {
    /* audit is best-effort; the run state is the authoritative terminal record */
  }
  try {
    const claim = await db.claim.findUnique({ where: { id: run.claimId }, select: { memberId: true, claimNumber: true } });
    if (claim) {
      const reason = routeCode ? getReason(routeCode as RouteCode) : null;
      await MemberNotificationService.notifyForClaim({
        tenantId: run.tenantId, memberId: claim.memberId, type: "CLAIM_STATUS",
        title: action === "CLAIM:AUTO_APPROVED" ? "Claim approved" : "Claim update",
        body: reason?.member ?? `Your claim ${claim.claimNumber} has been processed.`,
        href: "/member/utilization", metadata: { claimId: run.claimId, runId: run.id, action },
      });
    }
  } catch {
    /* notification is best-effort */
  }
}

async function handleFailureOrRetry(db: PrismaClient, run: ClaimedRun, owner: string, safeMessage: string, delayMs = RETRY_BASE_DELAY_MS): Promise<void> {
  if (run.attemptCount >= MAX_RUN_ATTEMPTS) {
    const applied = await markRunFailed(db, run.id, owner, { safeMessage });
    await mirrorToClaim(db, run.claimId, "FAILED", "PIPELINE_FAILED", "AUTOPILOT_FAILURE");
    if (applied) await onTerminal(db, run, "CLAIM:AUTOPILOT_RETRY_EXHAUSTED", "PIPELINE_FAILED");
  } else {
    // exponential-ish backoff on the attempt already recorded by claiming.
    const backoff = delayMs * Math.max(1, run.attemptCount);
    await markRunRetryable(db, run.id, owner, { safeMessage, nextAttemptAt: new Date(Date.now() + backoff) });
  }
}

/** Process a claimed run through the processor and apply its terminal/retry outcome. */
export async function processClaimRun(db: PrismaClient, run: ClaimedRun, owner: string): Promise<void> {
  try {
    const outcome = await processor(db, run);
    switch (outcome.kind) {
      case "ROUTED": {
        const applied = await markRunRouted(db, run.id, owner, { routeCode: outcome.routeCode, assignedQueue: outcome.assignedQueue, safeMessage: outcome.safeMessage, modeResolved: outcome.modeResolved, policyId: outcome.policyId });
        await mirrorToClaim(db, run.claimId, "ROUTED", outcome.routeCode, outcome.assignedQueue ?? null);
        if (applied) await onTerminal(db, run, "CLAIM:AUTOPILOT_ROUTED", outcome.routeCode);
        break;
      }
      case "SHADOW_COMPLETE": {
        const applied = await markRunShadowComplete(db, run.id, owner, { routeCode: outcome.routeCode, assignedQueue: outcome.assignedQueue, safeMessage: outcome.safeMessage, modeResolved: outcome.modeResolved, policyId: outcome.policyId });
        await mirrorToClaim(db, run.claimId, "SHADOW_COMPLETE", outcome.routeCode ?? null, outcome.assignedQueue ?? null);
        if (applied) await onTerminal(db, run, "CLAIM:AUTOPILOT_SHADOW_PROPOSED", outcome.routeCode ?? null);
        break;
      }
      case "AUTO_DECIDED": {
        const applied = await markRunAutoDecided(db, run.id, owner, { safeMessage: outcome.safeMessage, modeResolved: outcome.modeResolved, policyId: outcome.policyId });
        await mirrorToClaim(db, run.claimId, "AUTO_DECIDED", null, null);
        if (applied) await onTerminal(db, run, "CLAIM:AUTO_APPROVED", null);
        break;
      }
      case "RETRY":
        await handleFailureOrRetry(db, run, owner, outcome.safeMessage ?? "transient failure", outcome.delayMs);
        break;
    }
  } catch (err) {
    await handleFailureOrRetry(db, run, owner, safeErrorMessage(err));
  }
}

/** BullMQ handler: process a specific run by id (best-effort acceleration). */
export async function runClaimAutopilotRunJob(job: { data: { runId: string; tenantId?: string } }): Promise<void> {
  const claimed = await claimRunById(prisma, job.data.runId, { leaseOwner: WORKER_OWNER });
  if (!claimed) return; // already terminal or leased by another worker/sweeper
  await processClaimRun(prisma, claimed, WORKER_OWNER);
}

export interface RecoveryResult {
  processed: number;
  backlog: number;
}

/**
 * Recovery sweep: claim and process due runs in bounded batches. This is the
 * authoritative safety net — every accepted claim eventually processes here even
 * if its enqueue never happened or its worker crashed mid-run.
 */
export async function runClaimAutopilotRecoveryJob(opts: { batchSize?: number; owner?: string; db?: PrismaClient } = {}): Promise<RecoveryResult> {
  const db = opts.db ?? prisma;
  const owner = opts.owner ?? WORKER_OWNER;
  const batchSize = opts.batchSize ?? 25;
  let processed = 0;
  for (let i = 0; i < batchSize; i += 1) {
    const run = await claimNextRun(db, { leaseOwner: owner });
    if (!run) break;
    await processClaimRun(db, run, owner);
    processed += 1;
  }
  const backlog = await db.claimProcessingRun.count({ where: { state: { in: ["PENDING", "RETRYABLE"] } } });
  return { processed, backlog };
}
