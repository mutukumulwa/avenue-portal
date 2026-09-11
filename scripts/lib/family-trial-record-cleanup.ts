/**
 * Family Hospital UAT plan P07.01 — withdraw and cancel the trial records that
 * were priced from the global CPT reference table, without erasing history.
 *
 * The logic behind scripts/family-hospital-trial-record-cleanup.ts, kept apart
 * so a real-database test can drive it. Every change goes through a supported
 * lifecycle action — never a direct status write:
 *
 *  - a claim: `ClaimWithdrawalService.withdrawAsOperator` (status-guarded
 *    compare-and-swap to WITHDRAWN, lifecycle log, provider outbox event,
 *    hash-chained CLAIM:WITHDRAW audit);
 *  - a pre-authorisation: `preauthAdjudicationService.cancelPreAuth` (releases
 *    any hold, CANCELLED, hash-chained PREAUTH:CANCELLED audit) — the action the
 *    admin pre-auth page calls.
 *
 * Nothing is deleted. The run acts on the reviewed record set only, and refuses
 * — before writing anything — when the database has drifted from it.
 */
import type { PrismaClient } from "@prisma/client";
import { ROLES, type UserRole } from "../../src/lib/authz/roles";
import { ClaimWithdrawalService } from "../../src/server/services/claim-withdrawal/service";
import { CLAIM_WITHDRAWABLE_STATUSES } from "../../src/server/services/claim-withdrawal/policy";
import { preauthAdjudicationService } from "../../src/server/services/preauth-adjudication.service";
import { OperationReceiptService } from "../../src/server/services/operation-receipt.service";
import type { SuspectRecordSet } from "./family-hospital-reviewed";

/** DEC-FH-04's reason, on every record. */
export const CLEANUP_REASON = "TEST_DATA_INCORRECT_TARIFF";
export const CLEANUP_OPERATION = "family-hospital.p0701.trial-record-cleanup";

/** Undecided pre-authorisation states the cleanup cancels. Anything else is drift. */
const CANCELLABLE_PREAUTH_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];

export class CleanupRefused extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CleanupRefused";
  }
}

export type RecordAction = "WITHDRAW" | "CANCEL" | "ALREADY_DONE" | "REFUSE";

export interface RecordState {
  id: string;
  number: string;
  status: string | null;
  action: RecordAction;
  blocker?: string;
}

export interface Inspection {
  tenantId: string;
  providerId: string;
  claims: RecordState[];
  preauths: RecordState[];
  /** Records of this provider that the reviewed set does not name. */
  unexpected: Array<{ kind: "claim" | "preauth"; id: string; number: string; status: string }>;
  /** Why an apply would refuse; empty when the set matches the database. */
  refusals: string[];
}

export interface CleanupScope {
  tenantId: string;
  providerId: string;
}

/** Read-only: reconcile the reviewed set with the database (plan P07.01 step 1). */
export async function inspect(prisma: PrismaClient, scope: CleanupScope, suspect: SuspectRecordSet): Promise<Inspection> {
  const [claims, preauths] = await Promise.all([
    prisma.claim.findMany({
      where: { tenantId: scope.tenantId, providerId: scope.providerId },
      select: { id: true, claimNumber: true, status: true, decidedAt: true, paidAt: true, paymentVoucherId: true, settlementBatchId: true },
    }),
    prisma.preAuthorization.findMany({
      where: { tenantId: scope.tenantId, providerId: scope.providerId },
      select: { id: true, preauthNumber: true, status: true },
    }),
  ]);
  const fundTx = await prisma.fundTransaction.groupBy({
    by: ["claimId"],
    where: { tenantId: scope.tenantId, claimId: { in: claims.map((c) => c.id) } },
    _count: { _all: true },
  });
  const withFunds = new Set(fundTx.map((f) => f.claimId));

  const refusals: string[] = [];
  const claimStates: RecordState[] = suspect.claims.map((want) => {
    const row = claims.find((c) => c.id === want.id);
    if (!row) return { ...want, status: null, action: "REFUSE", blocker: "not found for this provider" };
    if (row.claimNumber !== want.number) return { ...want, status: row.status, action: "REFUSE", blocker: `number is ${row.claimNumber}` };
    if (row.status === "WITHDRAWN") return { ...want, status: row.status, action: "ALREADY_DONE" };
    if (!CLAIM_WITHDRAWABLE_STATUSES.includes(row.status)) return { ...want, status: row.status, action: "REFUSE", blocker: `a ${row.status} claim cannot be withdrawn` };
    if (row.decidedAt || row.paidAt || row.paymentVoucherId || row.settlementBatchId || withFunds.has(row.id)) {
      return { ...want, status: row.status, action: "REFUSE", blocker: "carries a financial record" };
    }
    return { ...want, status: row.status, action: "WITHDRAW" };
  });
  const preauthStates: RecordState[] = suspect.preauths.map((want) => {
    const row = preauths.find((p) => p.id === want.id);
    if (!row) return { ...want, status: null, action: "REFUSE", blocker: "not found for this provider" };
    if (row.preauthNumber !== want.number) return { ...want, status: row.status, action: "REFUSE", blocker: `number is ${row.preauthNumber}` };
    if (row.status === "CANCELLED") return { ...want, status: row.status, action: "ALREADY_DONE" };
    if (!CANCELLABLE_PREAUTH_STATUSES.includes(row.status)) return { ...want, status: row.status, action: "REFUSE", blocker: `a ${row.status} pre-authorisation is not undecided` };
    return { ...want, status: row.status, action: "CANCEL" };
  });

  const named = new Set([...suspect.claims.map((c) => c.id), ...suspect.preauths.map((p) => p.id)]);
  const unexpected = [
    ...claims.filter((c) => !named.has(c.id)).map((c) => ({ kind: "claim" as const, id: c.id, number: c.claimNumber, status: c.status })),
    ...preauths.filter((p) => !named.has(p.id)).map((p) => ({ kind: "preauth" as const, id: p.id, number: p.preauthNumber, status: p.status })),
  ];

  for (const r of [...claimStates, ...preauthStates]) if (r.action === "REFUSE") refusals.push(`${r.number} (${r.id}): ${r.blocker}`);
  for (const u of unexpected) {
    refusals.push(`${u.number} (${u.id}, ${u.status}) belongs to this provider but is not in the reviewed set — review it before any cleanup`);
  }

  return { ...scope, claims: claimStates, preauths: preauthStates, unexpected, refusals };
}

export interface CleanupStep {
  kind: "claim" | "preauth";
  id: string;
  number: string;
  fromStatus: string | null;
  toStatus: string;
  effect: "WITHDRAWN" | "CANCELLED" | "ALREADY_DONE";
}

export interface CleanupResult {
  outcome: "APPLIED" | "REPLAYED";
  operationId: string;
  batchRef: string;
  operatorUserId: string;
  reason: string;
  steps: CleanupStep[];
  before: Inspection;
  after: Inspection;
  auditEvents: Array<{ id: string; action: string; entityId: string | null; userId: string | null; createdAt: Date }>;
  lifecycleLogs: Array<{ id: string; claimId: string; userId: string | null; createdAt: Date }>;
}

async function evidenceRows(prisma: PrismaClient, tenantId: string, suspect: SuspectRecordSet) {
  const ids = [...suspect.claims.map((c) => c.id), ...suspect.preauths.map((p) => p.id)];
  const [auditEvents, lifecycleLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, entityId: { in: ids }, action: { in: ["CLAIM:WITHDRAW", "PREAUTH:CANCELLED"] } },
      select: { id: true, action: true, entityId: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.adjudicationLog.findMany({
      where: { claimId: { in: suspect.claims.map((c) => c.id) }, action: "WITHDRAWN" },
      select: { id: true, claimId: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { auditEvents: auditEvents.map((a) => ({ ...a, id: String(a.id) })), lifecycleLogs };
}

/**
 * Apply the cleanup (plan P07.01 steps 2–4). The operator must be an active user
 * of the tenant who may both withdraw claims (claims operations) and cancel
 * pre-authorisations (clinical) — the roles the admin surfaces require.
 *
 * Idempotent twice over: an operation receipt keyed by the batch ref replays a
 * finished run without writing, and every step is itself idempotent (an already
 * withdrawn claim or cancelled pre-auth is recorded as ALREADY_DONE). If a step
 * fails, the receipt is marked FAILED so the same batch may be re-run; the steps
 * that did commit are then recognised as already done.
 */
export async function applyCleanup(
  prisma: PrismaClient,
  input: { scope: CleanupScope; suspect: SuspectRecordSet; batchRef: string; operatorUserId: string },
): Promise<CleanupResult> {
  const { scope, suspect, batchRef, operatorUserId } = input;

  const operator = await prisma.user.findFirst({
    where: { id: operatorUserId, tenantId: scope.tenantId, isActive: true },
    select: { role: true },
  });
  const role = operator?.role as UserRole | undefined;
  if (!role || !(ROLES.CLAIMS_OPS as readonly UserRole[]).includes(role) || !(ROLES.CLINICAL as readonly UserRole[]).includes(role)) {
    throw new CleanupRefused("OPERATOR", "--operator-user-id must be an active user of this tenant with a claims-operations and clinical role.");
  }

  const before = await inspect(prisma, scope, suspect);
  if (before.refusals.length > 0) {
    throw new CleanupRefused("DRIFT", `The database no longer matches the reviewed set:\n  - ${before.refusals.join("\n  - ")}`);
  }

  const request = {
    providerId: scope.providerId,
    claims: suspect.claims.map((c) => c.id).sort(),
    preauths: suspect.preauths.map((p) => p.id).sort(),
    reason: CLEANUP_REASON,
  };
  const reservation = await OperationReceiptService.reserve(
    { tenantId: scope.tenantId, actorId: operatorUserId, operationType: CLEANUP_OPERATION, idempotencyKey: batchRef, request },
    prisma,
  );
  if (reservation.status === "REPLAY") {
    const evidence = await evidenceRows(prisma, scope.tenantId, suspect);
    return { outcome: "REPLAYED", operationId: reservation.receipt.id, batchRef, operatorUserId, reason: CLEANUP_REASON, steps: [], before, after: before, ...evidence };
  }
  if (reservation.status !== "RESERVED") {
    throw new CleanupRefused(`RECEIPT_${reservation.status}`, `${CLEANUP_OPERATION} ${batchRef} cannot run: its receipt is ${reservation.status}.`);
  }
  const operationId = reservation.receipt.id;

  const steps: CleanupStep[] = [];
  let current = "";
  try {
    for (const c of before.claims) {
      current = c.number;
      if (c.action === "ALREADY_DONE") {
        steps.push({ kind: "claim", id: c.id, number: c.number, fromStatus: c.status, toStatus: "WITHDRAWN", effect: "ALREADY_DONE" });
        continue;
      }
      const r = await ClaimWithdrawalService.withdrawAsOperator(
        { tenantId: scope.tenantId, actorId: operatorUserId },
        { claimId: c.id, reasonCode: CLEANUP_REASON, note: `operation ${batchRef}` },
      );
      steps.push({ kind: "claim", id: c.id, number: c.number, fromStatus: r.fromStatus, toStatus: r.status, effect: r.alreadyWithdrawn ? "ALREADY_DONE" : "WITHDRAWN" });
    }
    for (const p of before.preauths) {
      current = p.number;
      if (p.action === "ALREADY_DONE") {
        steps.push({ kind: "preauth", id: p.id, number: p.number, fromStatus: p.status, toStatus: "CANCELLED", effect: "ALREADY_DONE" });
        continue;
      }
      await preauthAdjudicationService.cancelPreAuth(p.id, scope.tenantId, operatorUserId, CLEANUP_REASON);
      steps.push({ kind: "preauth", id: p.id, number: p.number, fromStatus: p.status, toStatus: "CANCELLED", effect: "CANCELLED" });
    }
  } catch (err) {
    await OperationReceiptService.markFailed(operationId, `FAILED_AT:${current}`.slice(0, 64), prisma).catch(() => undefined);
    const done = steps.map((s) => `${s.number} ${s.effect}`).join(", ") || "none";
    throw new Error(`${current} failed (${(err as Error).message}). Steps committed before it: ${done}. The receipt is FAILED; re-run the same batch to finish — committed steps are recognised as already done.`);
  }

  const after = await inspect(prisma, scope, suspect);
  const evidence = await evidenceRows(prisma, scope.tenantId, suspect);
  const withdrawn = steps.filter((s) => s.effect === "WITHDRAWN").length;
  const cancelled = steps.filter((s) => s.effect === "CANCELLED").length;
  await OperationReceiptService.succeed(
    operationId,
    { entityType: "Provider", entityId: scope.providerId, entityRef: batchRef, resultCode: `WITHDRAWN:${withdrawn};CANCELLED:${cancelled}` },
    prisma,
  );
  return { outcome: "APPLIED", operationId, batchRef, operatorUserId, reason: CLEANUP_REASON, steps, before, after, ...evidence };
}
