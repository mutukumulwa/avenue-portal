/**
 * Claims Autopilot — the one public intake entry point (F3.4).
 *
 * `ClaimIntakeService.submit(caller, raw)` owns acceptance for every rail:
 *   parse → normalize → derive context → fingerprint → reserve receipt →
 *   persist (canonical owner) → enqueue processing (best-effort) → chain audit.
 *
 * D8/D9: database state is authoritative and acceptance is synchronous; the
 * enqueue is an optimization — a Redis/worker failure never fails acceptance
 * (the run stays PENDING and the sweeper recovers it, F3.6). Structural/scope
 * failures throw a safe `IntakeError` (mapped to 4xx by the transport); success
 * and replay/link return a stable `SubmitResult`.
 *
 * This service is ADDITIVE — production rails switch to it during M5 (F5.1+).
 */
import { randomUUID } from "node:crypto";
import type { ClaimIntakeReceiptState, PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditChainService } from "../audit-chain.service";
import { parseClaimSubmissionV1 } from "./schema";
import { normalizeSubmission, type NormalizedSubmission } from "./normalize";
import { resolveIntakeContext, type CallerIdentity, type IntakeContext } from "./context";
import { computeRequestHash, computeStrongEventFingerprint, computeSuspectedDuplicateFingerprint } from "./fingerprint";
import { reserveReceipt, markReceiptFailed } from "./receipt";
import { persistClaim, persistClaimWithinTransaction, type PersistOrigin, type PersistResult } from "./persist";
import { IntakeError } from "./errors";

export interface SubmitResult {
  success: true;
  replayed: boolean;
  receiptId: string;
  correlationId: string;
  claimId: string | null;
  claimNumber: string | null;
  receiptState: ClaimIntakeReceiptState;
  processingState: string | null;
  outcome: "ACCEPTED" | "REPLAYED" | "LINKED" | "PROCESSING";
}

/** Best-effort processing enqueuer. F3.6 registers the BullMQ implementation. */
export type ProcessingEnqueuer = (runId: string, tenantId: string) => Promise<void>;
let enqueuer: ProcessingEnqueuer = async () => {};
export function setProcessingEnqueuer(fn: ProcessingEnqueuer): void {
  enqueuer = fn;
}
/** Test/reset hook. */
export function resetProcessingEnqueuer(): void {
  enqueuer = async () => {};
}

function strongFingerprintFor(ctx: IntakeContext, n: NormalizedSubmission, origin?: PersistOrigin): string | null {
  return computeStrongEventFingerprint({
    tenantId: ctx.tenantId,
    providerId: ctx.providerId,
    providerOwnsInvoiceNamespace: ctx.providerOwnsInvoiceNamespace,
    invoiceNumber: n.invoiceNumber,
    integrationKeyId: ctx.integrationKeyId,
    externalClaimRef: n.externalClaimRef,
    caseId: origin?.caseId ?? null,
    caseSliceSeq: origin?.caseSliceSeq ?? null,
    caseFinal: origin?.caseId ? origin?.isInterimBill === false : undefined,
    entrySetHash: origin?.sliceEntryIds?.length ? hashEntrySet(origin.sliceEntryIds) : null,
    preauthId: origin?.preauthId ?? null,
    preauthConversionMarker: origin?.preauthId ? "convert:v1" : null,
  });
}

function hashEntrySet(ids: string[]): string {
  // Stable order-independent identity of the frozen entry set.
  return [...ids].sort().join(",");
}

function suspectFingerprintFor(ctx: IntakeContext, n: NormalizedSubmission): string {
  return computeSuspectedDuplicateFingerprint({
    tenantId: ctx.tenantId,
    providerId: ctx.providerId,
    branchId: ctx.providerBranchId,
    memberKey: ctx.memberId,
    normalized: n,
  });
}

async function fetchClaimState(claimId: string): Promise<{ claimNumber: string; processingState: string | null } | null> {
  const c = await prisma.claim.findUnique({ where: { id: claimId }, select: { claimNumber: true, processingState: true } });
  return c ? { claimNumber: c.claimNumber, processingState: c.processingState } : null;
}

export class ClaimIntakeService {
  /** The single public acceptance boundary. */
  static async submit(caller: CallerIdentity, raw: unknown): Promise<SubmitResult> {
    // 1–2. Structural parse + normalize (structural failure ⇒ 422, no receipt).
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) throw IntakeError.fromZod(parsed.error);
    const normalized = normalizeSubmission(parsed.data);

    // 3. Derive trusted scope (auth/scope failure ⇒ 401/403, no receipt).
    const ctx = await resolveIntakeContext(caller, parsed.data);

    // 4. Fingerprints.
    const requestHash = computeRequestHash(normalized);
    const strong = strongFingerprintFor(ctx, normalized);
    const suspect = suspectFingerprintFor(ctx, normalized);
    const correlationId = randomUUID();

    // 5. Reserve the receipt (resolves idempotency before any claim write).
    const reservation = await reserveReceipt(prisma, {
      tenantId: ctx.tenantId,
      scopeKey: ctx.scopeKey,
      channel: ctx.channel,
      idempotencyKey: normalized.idempotencyKey,
      schemaVersion: normalized.schemaVersion,
      requestHash,
      strongEventFingerprint: strong,
      suspectedDuplicateFingerprint: suspect,
      correlationId,
    });

    if (reservation.kind === "CONFLICT") {
      throw IntakeError.idempotencyConflict(reservation.receipt.id);
    }
    if (reservation.kind === "REPLAY") {
      return this.replayResult(reservation.receipt);
    }

    // 6. Persist atomically (canonical owner).
    const receipt = reservation.receipt;
    let result: PersistResult;
    try {
      result = await persistClaim(prisma, {
        context: ctx,
        normalized,
        receiptId: receipt.id,
        requestHash,
        strongEventFingerprint: strong,
        suspectedDuplicateFingerprint: suspect,
      });
    } catch (err) {
      const e = IntakeError.from(err);
      // A permanent failure is marked FAILED; a retryable one is left PROCESSING
      // for the recovery sweeper (F3.6).
      if (e.kind !== "RETRYABLE") {
        await markReceiptFailed(prisma, receipt.id, { outcomeCode: e.code, safeMessage: e.message }).catch(() => undefined);
      }
      throw e;
    }

    // 8. Chain-linked intake audit (never the plain writeAudit — §4.5).
    await this.appendIntakeAudit(ctx, receipt.id, result, correlationId, Number(normalized.totalBilled), ctx.currency);

    // 7. Best-effort enqueue AFTER commit — acceptance never depends on Redis.
    if (result.kind === "CREATED") {
      await enqueuer(result.runId, ctx.tenantId).catch(() => undefined);
    }

    const state = await fetchClaimState(result.claimId);
    return {
      success: true,
      replayed: result.kind === "STRONG_LINK",
      receiptId: receipt.id,
      correlationId,
      claimId: result.claimId,
      claimNumber: result.claimNumber,
      receiptState: "SUCCEEDED",
      processingState: state?.processingState ?? (result.kind === "CREATED" ? "PENDING" : null),
      outcome: result.kind === "CREATED" ? "ACCEPTED" : "LINKED",
    };
  }

  /**
   * Persist within an existing transaction — for case/preauth adapters (F5.7–5.9)
   * that own their domain transaction. The caller reserves the receipt and
   * supplies the derived context, normalized submission and origin links.
   */
  static async submitWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      context: IntakeContext;
      normalized: NormalizedSubmission;
      receiptId: string;
      requestHash: string;
      origin?: PersistOrigin;
      workflowVersion?: string;
    },
  ): Promise<PersistResult> {
    const strong = strongFingerprintFor(input.context, input.normalized, input.origin);
    const suspect = suspectFingerprintFor(input.context, input.normalized);
    return persistClaimWithinTransaction(tx, {
      context: input.context,
      normalized: input.normalized,
      receiptId: input.receiptId,
      requestHash: input.requestHash,
      strongEventFingerprint: strong,
      suspectedDuplicateFingerprint: suspect,
      origin: input.origin,
      workflowVersion: input.workflowVersion,
    });
  }

  /** Authoritative receipt lookup (F6.1 hardens auth/rate-limit). */
  static async getReceipt(tenantId: string, receiptId: string): Promise<SubmitResult | null> {
    const receipt = await prisma.claimIntakeReceipt.findFirst({ where: { id: receiptId, tenantId } });
    if (!receipt) return null;
    return this.replayResult(receipt);
  }

  private static async replayResult(receipt: { id: string; correlationId: string; claimId: string | null; state: ClaimIntakeReceiptState }): Promise<SubmitResult> {
    const state = receipt.claimId ? await fetchClaimState(receipt.claimId) : null;
    return {
      success: true,
      replayed: true,
      receiptId: receipt.id,
      correlationId: receipt.correlationId,
      claimId: receipt.claimId,
      claimNumber: state?.claimNumber ?? null,
      receiptState: receipt.state,
      processingState: state?.processingState ?? null,
      outcome: receipt.state === "SUCCEEDED" ? "REPLAYED" : "PROCESSING",
    };
  }

  private static async appendIntakeAudit(
    ctx: IntakeContext,
    receiptId: string,
    result: PersistResult,
    correlationId: string,
    totalBilled: number,
    currency: string,
  ): Promise<void> {
    await auditChainService
      .append({
        actorId: ctx.actorId,
        action: result.kind === "CREATED" ? "CLAIM:INTAKE_ACCEPTED" : "CLAIM:INTAKE_REPLAYED",
        module: "CLAIMS",
        entityType: "Claim",
        entityId: result.claimId,
        payload: { receiptId, correlationId, claimNumber: result.claimNumber, channel: ctx.channel, source: ctx.source, totalBilled, currency, linked: result.kind === "STRONG_LINK" },
        tenantId: ctx.tenantId,
        description: `Claim ${result.claimNumber} ${result.kind === "CREATED" ? "accepted" : "linked (replay)"} via ${ctx.channel}`,
      })
      .catch(() => undefined);
  }
}

/** Exposed for the enqueuer type used by F3.6. */
export type { PrismaClient };
