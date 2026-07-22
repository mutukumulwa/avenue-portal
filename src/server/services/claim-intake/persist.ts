/**
 * Claims Autopilot — the ONE canonical production Claim/ClaimLine creator (F3.3).
 *
 * After M5, this is the ONLY sanctioned `Claim.create` in production (the
 * consolidation guard enforces it). Everything atomic with claim creation lives
 * here: the claim + lines, provenance/fingerprints, the initial processing run,
 * PA/case/reimbursement origin links, and marking the reserved receipt SUCCEEDED.
 *
 * It does NOT send notifications, run fraud, or auto-decide (§F3.3 step 10) —
 * those happen in the processing runner (M4) after acceptance.
 *
 * Concurrency (D7/§8.3): an authoritative strong event fingerprint is unique per
 * tenant at the DB. A sequential duplicate is caught by the in-tx pre-check and
 * LINKS to the original (no new claim); a concurrent duplicate loses the unique
 * constraint (P2002) and the wrapper re-resolves it to a link. A suspected/
 * content fingerprint NEVER takes the link branch.
 */
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { IntakeError } from "./errors";
import type { IntakeContext } from "./context";
import type { NormalizedSubmission } from "./normalize";

type Tx = Prisma.TransactionClient;

export interface PersistOrigin {
  /** Pre-auth to attach atomically and mark ATTACHED (F5.7). */
  preauthId?: string;
  /** Case-derived claim provenance (F5.8/F5.9). */
  caseId?: string;
  caseSliceSeq?: number | null;
  isInterimBill?: boolean;
  sliceCutoffAt?: Date | null;
  sliceServiceFrom?: Date | null;
  sliceServiceTo?: Date | null;
  sliceEntryIds?: string[];
  /** Reimbursement claim fields (F5.6). The ReimbursementRequest row is the caller's adapter concern. */
  isReimbursement?: boolean;
  reimbursement?: { bankName?: string | null; accountNo?: string | null; mpesaPhone?: string | null };
  /** External reference for B2B idempotency continuity (unique per tenant+provider). */
  externalRef?: string | null;
}

export interface PersistInput {
  context: IntakeContext;
  normalized: NormalizedSubmission;
  receiptId: string;
  requestHash: string;
  strongEventFingerprint: string | null;
  suspectedDuplicateFingerprint: string;
  origin?: PersistOrigin;
  workflowVersion?: string;
}

export type PersistResult =
  | { kind: "CREATED"; claimId: string; claimNumber: string; runId: string }
  | { kind: "STRONG_LINK"; claimId: string; claimNumber: string };

const WORKFLOW_VERSION_DEFAULT = "v1";

function isP2002OnStrongFingerprint(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String((err.meta as { target?: unknown })?.target ?? "").includes("strongEventFingerprint")
  );
}
function isRetryableWrite(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    // claimNumber / externalRef collision, or a write conflict / serialization failure.
    (err.code === "P2002" || err.code === "P2034")
  );
}

/** Denormalized JSON snapshots kept alongside the authoritative claimLines. */
function diagnosesJson(n: NormalizedSubmission): Prisma.InputJsonValue {
  return n.diagnoses.map((d) => ({ icdCode: d.code, description: d.description, isPrimary: d.isPrimary })) as Prisma.InputJsonValue;
}
function proceduresJson(n: NormalizedSubmission): Prisma.InputJsonValue {
  return n.lines.map((l) => ({ cptCode: l.cptCode, drugCode: l.drugCode, icdCode: l.icdCode, description: l.description, quantity: l.quantity, unitCost: l.unitCost, totalCost: l.billedAmount })) as Prisma.InputJsonValue;
}

/**
 * Create the claim + lines + run and mark the receipt SUCCEEDED, all inside the
 * caller's transaction. Throws on a strong-fingerprint or claim-number collision
 * (P2002) so the transaction aborts; use `persistClaim` for the retry wrapper.
 */
export async function persistClaimWithinTransaction(tx: Tx, input: PersistInput): Promise<PersistResult> {
  const { context: ctx, normalized: n, receiptId, requestHash } = input;
  const workflowVersion = input.workflowVersion ?? WORKFLOW_VERSION_DEFAULT;
  const origin = input.origin ?? {};

  // 1. Recheck the reserved receipt inside the transaction.
  const receipt = await tx.claimIntakeReceipt.findUnique({ where: { id: receiptId }, select: { state: true, requestHash: true, claimId: true } });
  if (!receipt) throw IntakeError.retryable(undefined, { reason: "receipt missing at persist" });
  if (receipt.requestHash !== requestHash) throw IntakeError.idempotencyConflict(receiptId);
  if (receipt.state === "SUCCEEDED" && receipt.claimId) {
    const existing = await tx.claim.findUnique({ where: { id: receipt.claimId }, select: { id: true, claimNumber: true } });
    if (existing) return { kind: "STRONG_LINK", claimId: existing.id, claimNumber: existing.claimNumber };
  }

  // 2. Authoritative strong-event pre-check (sequential duplicate ⇒ link, no new claim).
  if (input.strongEventFingerprint) {
    const prior = await tx.claim.findFirst({
      where: { tenantId: ctx.tenantId, strongEventFingerprint: input.strongEventFingerprint },
      select: { id: true, claimNumber: true },
    });
    if (prior) {
      await linkReceipt(tx, receiptId, prior.id);
      return { kind: "STRONG_LINK", claimId: prior.id, claimNumber: prior.claimNumber };
    }
  }

  // 3. Collision-safe claim number (max+1 seed; a P2002 aborts the tx → wrapper retries).
  const claimNumber = await peekNextDocumentNumber("CLM", (yp) =>
    tx.claim
      .findFirst({ where: { tenantId: ctx.tenantId, claimNumber: { startsWith: yp } }, orderBy: { claimNumber: "desc" }, select: { claimNumber: true } })
      .then((r) => r?.claimNumber ?? null),
  );

  // 4. Create the claim + lines with full provenance.
  const total = new Decimal(n.totalBilled);
  const claim = await tx.claim.create({
    data: {
      tenantId: ctx.tenantId,
      claimNumber,
      currency: ctx.currency,
      source: ctx.source,
      memberId: ctx.memberId,
      providerId: ctx.providerId,
      providerBranchId: ctx.providerBranchId,
      invoiceNumber: n.invoiceNumber,
      externalRef: origin.externalRef ?? n.externalClaimRef ?? null,
      serviceType: n.encounter.serviceType,
      benefitCategory: n.encounter.benefitCategory,
      dateOfService: new Date(n.encounter.serviceFrom),
      admissionDate: n.encounter.admissionDate ? new Date(n.encounter.admissionDate) : null,
      dischargeDate: n.encounter.dischargeDate ? new Date(n.encounter.dischargeDate) : null,
      attendingDoctor: n.encounter.attendingDoctor,
      diagnoses: diagnosesJson(n),
      procedures: proceduresJson(n),
      billedAmount: total,
      status: "RECEIVED",
      // Claims Autopilot provenance
      intakeSchemaVersion: n.schemaVersion,
      claimRevision: 1,
      strongEventFingerprint: input.strongEventFingerprint,
      suspectedDuplicateFingerprint: input.suspectedDuplicateFingerprint,
      processingState: "PENDING",
      // Origin links (atomic)
      ...(origin.caseId
        ? {
            caseId: origin.caseId,
            isInterimBill: origin.isInterimBill ?? false,
            caseSliceSeq: origin.caseSliceSeq ?? null,
            sliceCutoffAt: origin.sliceCutoffAt ?? null,
            sliceServiceFrom: origin.sliceServiceFrom ?? null,
            sliceServiceTo: origin.sliceServiceTo ?? null,
            ...(origin.sliceEntryIds?.length ? { sliceEntries: { connect: origin.sliceEntryIds.map((id) => ({ id })) } } : {}),
          }
        : {}),
      ...(origin.preauthId ? { preauths: { connect: [{ id: origin.preauthId }] } } : {}),
      ...(origin.isReimbursement
        ? {
            isReimbursement: true,
            reimbursementBankName: origin.reimbursement?.bankName ?? null,
            reimbursementAccountNo: origin.reimbursement?.accountNo ?? null,
            reimbursementMpesaPhone: origin.reimbursement?.mpesaPhone ?? null,
          }
        : {}),
      claimLines: {
        create: n.lines.map((l) => ({
          lineNumber: l.lineNumber,
          serviceCategory: l.serviceCategory,
          description: l.description,
          cptCode: l.cptCode,
          icdCode: l.icdCode,
          drugCode: l.drugCode,
          quantity: l.quantity,
          unitCost: new Decimal(l.unitCost),
          billedAmount: new Decimal(l.billedAmount),
        })),
      },
    },
    select: { id: true, claimNumber: true },
  });

  // 5. PA attach state (atomic with creation).
  if (origin.preauthId) {
    await tx.preAuthorization.update({ where: { id: origin.preauthId }, data: { status: "ATTACHED", attachedAt: new Date() } });
  }

  // 6. Initial processing run (PENDING — the runner claims it later).
  const run = await tx.claimProcessingRun.create({
    data: {
      tenantId: ctx.tenantId,
      claimId: claim.id,
      receiptId,
      claimRevision: 1,
      workflowVersion,
      sequence: 1,
      trigger: "INITIAL",
      state: "PENDING",
    },
    select: { id: true },
  });

  // 7. Mark the receipt SUCCEEDED and link it — atomic with the claim.
  await linkReceipt(tx, receiptId, claim.id);

  return { kind: "CREATED", claimId: claim.id, claimNumber: claim.claimNumber, runId: run.id };
}

async function linkReceipt(tx: Tx, receiptId: string, claimId: string): Promise<void> {
  await tx.claimIntakeReceipt.update({
    where: { id: receiptId },
    data: { state: "SUCCEEDED", claimId, outcomeCode: "ACCEPTED", httpStatus: 201, completedAt: new Date() },
  });
}

/**
 * Open a transaction and persist, with a bounded retry that re-resolves a
 * concurrent strong-fingerprint collision to a link (no duplicate claim) and
 * retries a claim-number/serialization conflict.
 */
export async function persistClaim(prisma: PrismaClient, input: PersistInput, maxAttempts = 5): Promise<PersistResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => persistClaimWithinTransaction(tx, input));
    } catch (err) {
      if (isP2002OnStrongFingerprint(err) && input.strongEventFingerprint) {
        // A concurrent transaction won the authoritative event — link to it.
        const prior = await prisma.claim.findFirst({
          where: { tenantId: input.context.tenantId, strongEventFingerprint: input.strongEventFingerprint },
          select: { id: true, claimNumber: true },
        });
        if (prior) {
          await prisma.claimIntakeReceipt.update({
            where: { id: input.receiptId },
            data: { state: "SUCCEEDED", claimId: prior.id, outcomeCode: "REPLAYED", completedAt: new Date() },
          });
          return { kind: "STRONG_LINK", claimId: prior.id, claimNumber: prior.claimNumber };
        }
        // else fall through to retry
      } else if (!isRetryableWrite(err)) {
        throw err;
      }
      if (attempt === maxAttempts) throw IntakeError.retryable(undefined, { reason: "persist retries exhausted" });
    }
  }
  // Unreachable, but satisfies the type checker.
  throw IntakeError.retryable(undefined, { reason: "persist retries exhausted" });
}
