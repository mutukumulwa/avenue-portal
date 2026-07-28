import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { looksLowLevel } from "@/lib/safe-action-error";
import {
  ProviderAccessService,
  type ProviderAccessContext,
} from "@/server/services/provider-access.service";
import { CaseServiceDeliveryProcessor } from "./delivery-processor.service";

/**
 * PNOS F9.6 — retry, poison quarantine, and sweeper.
 *
 * Wraps the F9.5 processing of a durable delivery with a safe retry lifecycle:
 * durable per-delivery LEASE (one worker at a time; a crashed worker's lease
 * expires and another reclaims it), an append-only ATTEMPT ledger, exponential
 * backoff with a max-attempt ceiling, and poison QUARANTINE with a safe reason.
 * A sweeper drains retry-due / abandoned deliveries from durable DB state, and an
 * authorized MANUAL retry re-drives a stuck delivery after remediation.
 *
 * Reprocessing is idempotent (F9.5 per-record results ⇒ canonical effects once).
 * The retry UNIT needs the body again: a PUSH delivery is re-driven by a client
 * re-POST or an authorized manual retry (body re-supplied); a PULL re-fetch is
 * F9.7. We NEVER retain the raw clinical body, so the sweeper itself does no
 * outbound fetch (F9.6 stop: no outbound pull) — it manages the lease/attempt/
 * quarantine lifecycle and surfaces retry-due deliveries.
 *
 * No schema change — F9.2 provisioned the lease/attempt/backoff fields.
 */

const PERMISSION = "provider.integrations.manage";
const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000; // a worker holds a delivery for ≤5 min
const BACKOFF_BASE_MS = 30 * 1000; // 30s
const BACKOFF_CAP_MS = 60 * 60 * 1000; // 1h

export type AttemptResultKind = "done" | "retry" | "fatal";
export interface AttemptResult {
  kind: AttemptResultKind;
  resultClass?: string; // SUCCESS | TIMEOUT | HTTP_5XX | HTTP_4XX | SCHEMA | POISON | TRANSIENT
  httpStatus?: number;
  reason?: string; // SAFE — no raw body/secret
  report?: unknown;
}

export type RunFn = (delivery: DeliveryRow) => Promise<AttemptResult>;

export interface DeliveryRow {
  id: string;
  tenantId: string;
  providerId: string;
  businessObjectType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface RunAttemptOptions {
  owner?: string;
  now?: Date;
  leaseTtlMs?: number;
}

export type RunAttemptOutcome =
  | { status: "skipped"; reason: string }
  | { status: "done"; report?: unknown }
  | { status: "retrying"; nextAttemptAt: Date }
  | { status: "quarantined"; reason: string };

export class DeliveryRetryError extends Error {
  constructor(public code: "NOT_FOUND" | "UNSUPPORTED_TYPE", message: string) {
    super(message);
    this.name = "DeliveryRetryError";
  }
}

/** Exponential backoff (deterministic, no jitter) capped at BACKOFF_CAP_MS. */
export function backoffMs(attemptNumber: number): number {
  const raw = BACKOFF_BASE_MS * 2 ** Math.max(0, attemptNumber - 1);
  return Math.min(BACKOFF_CAP_MS, raw);
}

const DELIVERY_SELECT = {
  id: true, tenantId: true, providerId: true, businessObjectType: true, status: true, attemptCount: true, maxAttempts: true,
} as const;

async function recordAttempt(
  deliveryId: string,
  attemptNumber: number,
  a: { resultClass: string; retryable: boolean; httpStatus?: number; safeErrorCode?: string; nextAttemptAt?: Date | null; startedAt: Date; endedAt: Date },
) {
  await prisma.providerIntegrationAttempt.create({
    data: {
      deliveryId,
      attemptNumber,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      resultClass: a.resultClass,
      httpStatus: a.httpStatus ?? null,
      safeErrorCode: a.safeErrorCode ?? null,
      retryable: a.retryable,
      nextAttemptAt: a.nextAttemptAt ?? null,
    },
  });
}

export const DeliveryRetryService = {
  backoffMs,

  /**
   * Atomically acquire the delivery lease when it is free, expired, or already
   * ours (a compare-and-set via a conditional updateMany). Returns false when
   * another live worker holds it.
   */
  async acquireLease(deliveryId: string, owner: string, ttlMs = DEFAULT_LEASE_TTL_MS, now = new Date()): Promise<boolean> {
    const res = await prisma.providerIntegrationDelivery.updateMany({
      where: {
        id: deliveryId,
        OR: [{ leaseOwner: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }, { leaseOwner: owner }],
      },
      data: { leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + ttlMs) },
    });
    return res.count === 1;
  },

  async releaseLease(deliveryId: string, owner: string) {
    await prisma.providerIntegrationDelivery.updateMany({
      where: { id: deliveryId, leaseOwner: owner },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
  },

  /**
   * Run one leased attempt of `runFn` against the delivery and apply the retry
   * policy: success clears the schedule; a retryable failure backs off (or
   * quarantines at the attempt ceiling); a fatal/poison failure quarantines with a
   * safe reason. Records the attempt in the ledger. Skips if another worker holds
   * the lease.
   */
  async runAttempt(deliveryId: string, runFn: RunFn, opts: RunAttemptOptions = {}): Promise<RunAttemptOutcome> {
    const owner = opts.owner ?? randomUUID();
    const now = opts.now ?? new Date();

    const leased = await this.acquireLease(deliveryId, owner, opts.leaseTtlMs, now);
    if (!leased) return { status: "skipped", reason: "held by another worker" };

    try {
      const delivery = await prisma.providerIntegrationDelivery.findFirst({ where: { id: deliveryId }, select: DELIVERY_SELECT });
      if (!delivery) return { status: "skipped", reason: "not found" };
      const attemptNumber = delivery.attemptCount + 1;

      let result: AttemptResult;
      try {
        result = await runFn(delivery);
      } catch (e) {
        // Classify a thrown error: infra/transient ⇒ retry; anything else ⇒ poison.
        const transient = e instanceof Error && looksLowLevel(e);
        result = { kind: transient ? "retry" : "fatal", resultClass: transient ? "TRANSIENT" : "POISON", reason: e instanceof Error ? e.message : "attempt failed" };
      }

      const end = new Date(now.getTime());
      if (result.kind === "done") {
        await recordAttempt(deliveryId, attemptNumber, { resultClass: result.resultClass ?? "SUCCESS", retryable: false, httpStatus: result.httpStatus, startedAt: now, endedAt: end });
        await prisma.providerIntegrationDelivery.update({ where: { id: deliveryId }, data: { attemptCount: attemptNumber, nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null } });
        return { status: "done", report: result.report };
      }

      const exhausted = attemptNumber >= delivery.maxAttempts;
      if (result.kind === "fatal" || exhausted) {
        const reason = result.kind === "fatal" ? result.reason ?? "poison record" : "retry attempts exhausted";
        await recordAttempt(deliveryId, attemptNumber, { resultClass: result.resultClass ?? "POISON", retryable: false, httpStatus: result.httpStatus, safeErrorCode: result.reason, startedAt: now, endedAt: end });
        await prisma.providerIntegrationDelivery.update({ where: { id: deliveryId }, data: { attemptCount: attemptNumber, status: "QUARANTINED", quarantineReason: reason, nextAttemptAt: null, leaseOwner: null, leaseExpiresAt: null, completedAt: end } });
        return { status: "quarantined", reason };
      }

      const nextAttemptAt = new Date(now.getTime() + backoffMs(attemptNumber));
      await recordAttempt(deliveryId, attemptNumber, { resultClass: result.resultClass ?? "TRANSIENT", retryable: true, httpStatus: result.httpStatus, safeErrorCode: result.reason, nextAttemptAt, startedAt: now, endedAt: end });
      await prisma.providerIntegrationDelivery.update({ where: { id: deliveryId }, data: { attemptCount: attemptNumber, status: "RETRYING", nextAttemptAt, leaseOwner: null, leaseExpiresAt: null } });
      return { status: "retrying", nextAttemptAt };
    } finally {
      await this.releaseLease(deliveryId, owner).catch(() => undefined);
    }
  },

  /**
   * Drain retry-due / abandoned deliveries from durable DB state. Because we retain
   * no raw body, the sweeper does NOT re-fetch a PUSH body (F9.6 stop: no outbound
   * pull) — it quarantines deliveries that have exhausted their attempts and
   * surfaces the rest as retry-due (a client re-POST or an authorized manual retry
   * re-drives them; a PULL re-fetch is F9.7).
   */
  async sweep(opts: { now?: Date; limit?: number } = {}): Promise<{ scanned: number; quarantined: number; retryDue: number }> {
    const now = opts.now ?? new Date();
    const due = await prisma.providerIntegrationDelivery.findMany({
      where: {
        status: { in: ["ACCEPTED", "RETRYING"] },
        nextAttemptAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      select: { id: true, attemptCount: true, maxAttempts: true },
      take: opts.limit ?? 100,
      orderBy: { nextAttemptAt: "asc" },
    });

    let quarantined = 0;
    let retryDue = 0;
    for (const d of due) {
      if (d.attemptCount >= d.maxAttempts) {
        await prisma.providerIntegrationDelivery.update({
          where: { id: d.id },
          data: { status: "QUARANTINED", quarantineReason: "retry attempts exhausted (sweeper)", nextAttemptAt: null, completedAt: now, leaseOwner: null, leaseExpiresAt: null },
        });
        quarantined++;
      } else {
        retryDue++; // needs a re-supplied body — surfaced for re-POST / manual retry / F9.7 pull
      }
    }
    return { scanned: due.length, quarantined, retryDue };
  },

  /**
   * Authorized manual retry after remediation. Re-drives a stuck (RETRYING/
   * QUARANTINED) delivery with a RE-SUPPLIED body — idempotent, so already-applied
   * records replay and nothing is duplicated. Provider-scoped: a foreign delivery
   * is a safe not-found.
   */
  async manualRetry(ctx: ProviderAccessContext, deliveryId: string, rawBody: string, opts: { now?: Date } = {}): Promise<RunAttemptOutcome> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const now = opts.now ?? new Date();
    const delivery = await prisma.providerIntegrationDelivery.findFirst({ where: { id: deliveryId, tenantId: ctx.tenantId }, select: DELIVERY_SELECT });
    if (!delivery || delivery.providerId !== ctx.providerId) throw new DeliveryRetryError("NOT_FOUND", "No such delivery");
    if (delivery.businessObjectType !== CaseServiceDeliveryProcessor.OBJECT_TYPE) {
      throw new DeliveryRetryError("UNSUPPORTED_TYPE", `No processor for ${delivery.businessObjectType}`);
    }

    // Reset to a processable state, then re-drive through the standard attempt lifecycle.
    await prisma.providerIntegrationDelivery.update({ where: { id: deliveryId }, data: { status: "ACCEPTED", quarantineReason: null, nextAttemptAt: now } });
    return this.runAttempt(
      deliveryId,
      async (d) => {
        const report = await CaseServiceDeliveryProcessor.process(d.id, rawBody);
        return report.retrying > 0 ? { kind: "retry", resultClass: "TRANSIENT", report } : { kind: "done", report };
      },
      { owner: ctx.actorId, now },
    );
  },
} as const;
