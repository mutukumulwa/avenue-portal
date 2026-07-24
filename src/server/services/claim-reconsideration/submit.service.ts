import { prisma } from "@/lib/prisma";
import { Prisma, ClaimStatus, type ReconsiderationStatus } from "@prisma/client";
import { ProviderAccessService, ProviderAccessError, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import {
  RECONSIDERABLE_CLAIM_STATUSES,
  isReconsiderationReasonEligible,
  resolveReconsiderationDeadline,
} from "./policy";

/**
 * PNOS F5.12 — reconsideration eligibility + submit.
 *
 * A provider creates ONE governed reconsideration case (F5.11 schema) challenging a DECIDED
 * claim. Per D13 this NEVER changes the claim's status or money — the service only creates the
 * ClaimReconsideration + its line snapshots + a first event. Eligibility reuses the F5.11 policy
 * (reconsiderable decision state, reason eligibility by decision, deadline from the decision
 * date). Idempotent: a same-key submit returns the existing case (the @@unique[tenant,key] backs
 * a concurrent race); a second ACTIVE reconsideration on the same claim is refused. No review/
 * outcome yet (F5.14+). This writes NO claim status ⇒ no mutation-guard concern.
 */

const RECONSIDER_PERMISSION = "provider.claim.reconsider";
/** A claim may carry at most one ACTIVE reconsideration — the terminal states free it. */
const TERMINAL_RECONSIDERATION_STATUSES: ReconsiderationStatus[] = ["UPHELD", "WITHDRAWN", "CLOSED"];
const DEFAULT_TRIAGE_SLA_HOURS = 72;
/** Evidence must be scanned clean (F2.5) — never PENDING/REJECTED/QUARANTINED/ERROR. */
const UNCLEAN_SCAN = ["PENDING", "REJECTED", "QUARANTINED", "ERROR"];

export type ReconsiderationEligibilityCode =
  | "ELIGIBLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_RECONSIDERABLE"
  | "DEADLINE_PASSED"
  | "REASON_NOT_ELIGIBLE"
  | "ALREADY_ACTIVE";

export interface ReconsiderationEligibility {
  eligible: boolean;
  code: ReconsiderationEligibilityCode;
  reason: string; // always safe (provider-facing)
  deadline: Date | null;
}

export type ReconsiderationSubmitErrorCode =
  | Exclude<ReconsiderationEligibilityCode, "ELIGIBLE">
  | "INVALID"
  | "LINE_NOT_IN_CLAIM"
  | "UNCLEAN_EVIDENCE";

export class ReconsiderationSubmitError extends Error {
  constructor(public code: ReconsiderationSubmitErrorCode, message: string) {
    super(message);
    this.name = "ReconsiderationSubmitError";
  }
}
export function isReconsiderationSubmitError(e: unknown): e is ReconsiderationSubmitError {
  return e instanceof ReconsiderationSubmitError;
}

export interface SubmitReconsiderationCommand {
  tenantId: string;
  claimId: string;
  idempotencyKey: string;
  reasonCode: string;
  providerNarrative: string;
  /** The total additional amount requested (> 0). */
  requestedAmount: number;
  lines: Array<{ claimLineId: string; disputedCategory?: string; narrative?: string; requestedAllowed?: number; requestedPayable?: number }>;
  /** Optional pre-uploaded evidence — each must be scanned clean (F2.5). */
  evidenceDocumentIds?: string[];
}

export interface SubmitReconsiderationResult {
  reconsiderationId: string;
  claimId: string;
  status: "SUBMITTED";
  filingDeadline: Date;
  /** true ⇒ idempotent replay returned the existing case (no new case). */
  replayed: boolean;
}

function no(code: ReconsiderationEligibilityCode, reason: string, deadline: Date | null = null): ReconsiderationEligibility {
  return { eligible: false, code, reason, deadline };
}

export const ClaimReconsiderationService = {
  /**
   * Whether THIS actor may file a reconsideration on `claimId` (F5.13 gating). With a reasonCode,
   * also checks reason eligibility. `at` is injectable for deterministic deadline testing.
   */
  async checkEligibility(ctx: ProviderAccessContext, claimId: string, opts: { reasonCode?: string; at?: Date } = {}): Promise<ReconsiderationEligibility> {
    const at = opts.at ?? new Date();
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: { id: true, status: true, providerBranchId: true, decidedAt: true },
    });
    if (!claim) return no("NOT_FOUND", "Claim not found.");
    if (!ProviderAccessService.hasPermission(ctx, RECONSIDER_PERMISSION)) return no("FORBIDDEN", "You do not have permission to file reconsiderations.");
    if (claim.providerBranchId && !ProviderAccessService.hasBranch(ctx, claim.providerBranchId)) return no("FORBIDDEN", "This claim belongs to a branch outside your access.");
    if (!RECONSIDERABLE_CLAIM_STATUSES.includes(claim.status)) return no("NOT_RECONSIDERABLE", "Only a decided claim can be reconsidered.");

    const active = await prisma.claimReconsideration.count({
      where: { tenantId: ctx.tenantId, claimId: claim.id, status: { notIn: TERMINAL_RECONSIDERATION_STATUSES } },
    });
    if (active > 0) return no("ALREADY_ACTIVE", "A reconsideration for this claim is already in progress.");

    const deadline = resolveReconsiderationDeadline({ decidedAt: claim.decidedAt ?? at });
    if (at.getTime() > deadline.getTime()) return { eligible: false, code: "DEADLINE_PASSED", reason: "The window to reconsider this decision has passed.", deadline };

    if (opts.reasonCode && !isReconsiderationReasonEligible(opts.reasonCode, claim.status)) {
      return { eligible: false, code: "REASON_NOT_ELIGIBLE", reason: "This reason does not apply to this decision.", deadline };
    }
    return { eligible: true, code: "ELIGIBLE", reason: "This claim can be reconsidered.", deadline };
  },

  async submit(ctx: ProviderAccessContext, command: SubmitReconsiderationCommand): Promise<SubmitReconsiderationResult> {
    if (command.tenantId !== ctx.tenantId) throw new ReconsiderationSubmitError("NOT_FOUND", "Claim not found.");
    ProviderAccessService.requirePermission(ctx, RECONSIDER_PERMISSION);

    // 1. Load the claim + lines SCOPED to this provider (frozen-fact source + NOT_FOUND).
    const claim = await prisma.claim.findFirst({
      where: { id: command.claimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true, claimNumber: true, status: true, providerId: true, providerBranchId: true, currency: true,
        decidedAt: true, adjudicatorId: true, chainRootClaimId: true,
        member: { select: { group: { select: { clientId: true } } } },
        claimLines: { select: { id: true, billedAmount: true, approvedAmount: true, payerLiability: true, memberLiability: true, providerWriteOff: true } },
      },
    });
    if (!claim) throw new ReconsiderationSubmitError("NOT_FOUND", "Claim not found.");
    if (claim.providerBranchId) ProviderAccessService.requireBranch(ctx, claim.providerBranchId);

    // 2. Idempotent replay — a same-key submit returns the existing case (before any duplicate check).
    const existing = await prisma.claimReconsideration.findFirst({
      where: { tenantId: ctx.tenantId, idempotencyKey: command.idempotencyKey },
      select: { id: true, claimId: true, filingDeadline: true },
    });
    if (existing) {
      return { reconsiderationId: existing.id, claimId: existing.claimId, status: "SUBMITTED", filingDeadline: existing.filingDeadline ?? new Date(), replayed: true };
    }

    // 3. Eligibility (decided state, reason, deadline, one-active).
    if (!RECONSIDERABLE_CLAIM_STATUSES.includes(claim.status)) throw new ReconsiderationSubmitError("NOT_RECONSIDERABLE", "Only a decided claim can be reconsidered.");
    if (!isReconsiderationReasonEligible(command.reasonCode, claim.status)) throw new ReconsiderationSubmitError("REASON_NOT_ELIGIBLE", "This reason does not apply to this decision.");
    const deadline = resolveReconsiderationDeadline({ decidedAt: claim.decidedAt ?? new Date() });
    if (Date.now() > deadline.getTime()) throw new ReconsiderationSubmitError("DEADLINE_PASSED", "The window to reconsider this decision has passed.");
    const active = await prisma.claimReconsideration.count({
      where: { tenantId: ctx.tenantId, claimId: claim.id, status: { notIn: TERMINAL_RECONSIDERATION_STATUSES } },
    });
    if (active > 0) throw new ReconsiderationSubmitError("ALREADY_ACTIVE", "A reconsideration for this claim is already in progress.");

    // 4. Validate the submission (narrative, requested delta, line targets, clean evidence).
    const narrative = (command.providerNarrative ?? "").trim();
    if (!narrative) throw new ReconsiderationSubmitError("INVALID", "A narrative describing the dispute is required.");
    if (!(command.requestedAmount > 0)) throw new ReconsiderationSubmitError("INVALID", "The requested amount must be greater than zero.");
    if (!command.lines?.length) throw new ReconsiderationSubmitError("INVALID", "Select at least one line to reconsider.");
    const lineMap = new Map(claim.claimLines.map((l) => [l.id, l]));
    for (const l of command.lines) {
      if (!lineMap.has(l.claimLineId)) throw new ReconsiderationSubmitError("LINE_NOT_IN_CLAIM", "A selected line does not belong to this claim.");
    }
    if (command.evidenceDocumentIds?.length) {
      const clean = await prisma.document.count({
        where: { id: { in: command.evidenceDocumentIds }, tenantId: ctx.tenantId, scanStatus: { notIn: UNCLEAN_SCAN as never } },
      });
      if (clean !== command.evidenceDocumentIds.length) throw new ReconsiderationSubmitError("UNCLEAN_EVIDENCE", "All evidence must be uploaded and virus-scanned clean before submission.");
    }

    // 5. Create the case + line snapshots + first event, idempotently. NO claim write (D13).
    const clientId = claim.member?.group?.clientId ?? null;
    const claimPaid = claim.status === ClaimStatus.PAID;
    const dueAt = new Date(Date.now() + DEFAULT_TRIAGE_SLA_HOURS * 3_600_000);
    let created: { id: string; filingDeadline: Date | null };
    try {
      created = await prisma.claimReconsideration.create({
        data: {
          tenantId: ctx.tenantId,
          clientId,
          providerId: claim.providerId,
          providerBranchId: claim.providerBranchId,
          claimId: claim.id,
          chainRootClaimId: claim.chainRootClaimId ?? claim.id,
          reasonCode: command.reasonCode,
          providerNarrative: narrative,
          requestedAmount: command.requestedAmount,
          currency: claim.currency,
          filingDeadline: deadline,
          filedAt: new Date(),
          status: "SUBMITTED",
          originalAdjudicatorId: claim.adjudicatorId,
          slaPolicy: "DEFAULT_TRIAGE",
          slaVersion: "v1",
          dueAt,
          idempotencyKey: command.idempotencyKey,
          version: 1,
          lines: {
            create: command.lines.map((l) => {
              const cl = lineMap.get(l.claimLineId)!;
              return {
                claimLineId: l.claimLineId,
                disputedCategory: l.disputedCategory ?? null,
                narrative: l.narrative ?? null,
                // Frozen original economics (exact snapshot).
                originalBilled: cl.billedAmount,
                originalAllowed: cl.approvedAmount,
                originalPayable: cl.payerLiability,
                originalMemberShare: cl.memberLiability,
                originalWriteoff: cl.providerWriteOff,
                requestedAllowed: l.requestedAllowed ?? null,
                requestedPayable: l.requestedPayable ?? null,
                alreadyApproved: cl.approvedAmount,
                alreadyPaid: claimPaid ? cl.approvedAmount : 0,
                // maxIncrement / awardedIncrement stay 0 until the reviewer corrects entitlement (F5.15).
              };
            }),
          },
          events: {
            create: [{
              tenantId: ctx.tenantId,
              sequence: 1,
              eventType: "SUBMITTED",
              newStatus: "SUBMITTED",
              safeReasonCode: command.reasonCode,
              actorType: "USER",
              actorId: ctx.actorId,
              metadata: (command.evidenceDocumentIds?.length ? { evidenceCount: command.evidenceDocumentIds.length } : undefined) as Prisma.InputJsonValue | undefined,
            }],
          },
        },
        select: { id: true, filingDeadline: true },
      });
    } catch (e) {
      // Concurrent same-key submit — the @@unique[tenant, idempotencyKey] caught the loser.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const winner = await prisma.claimReconsideration.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: command.idempotencyKey }, select: { id: true, filingDeadline: true } });
        if (winner) return { reconsiderationId: winner.id, claimId: claim.id, status: "SUBMITTED", filingDeadline: winner.filingDeadline ?? deadline, replayed: true };
      }
      throw e;
    }

    // 6. Post-commit audit + outbox. The original claim row/benefit/GL/fund are untouched (D13).
    await auditChainService.append({
      actorId: ctx.actorId,
      action: "RECONSIDERATION:SUBMIT",
      module: "CLAIMS",
      entityType: "ClaimReconsideration",
      entityId: created.id,
      tenantId: ctx.tenantId,
      payload: { claimId: claim.id, claimNumber: claim.claimNumber, reasonCode: command.reasonCode, lineCount: command.lines.length },
      description: `Reconsideration filed on claim ${claim.claimNumber} (${command.reasonCode}).`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: ctx.tenantId,
      providerId: claim.providerId,
      channel: "IN_APP",
      eventType: "RECONSIDERATION_SUBMITTED",
      priority: "NORMAL",
      title: "Reconsideration submitted",
      body: `Your reconsideration on claim ${claim.claimNumber} has been submitted for review.`,
      href: `/provider/claims/${claim.id}`,
      metadata: { reconsiderationId: created.id, claimId: claim.id },
      dedupeKey: `reconsideration-submitted:${created.id}`,
    }).catch(() => undefined);

    return { reconsiderationId: created.id, claimId: claim.id, status: "SUBMITTED", filingDeadline: created.filingDeadline ?? deadline, replayed: false };
  },
} as const;

export { ProviderAccessError };
