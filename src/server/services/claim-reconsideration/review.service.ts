import { prisma } from "@/lib/prisma";
import { Prisma, type ReconsiderationStatus } from "@prisma/client";
import { ProviderAccessService, ProviderAccessError, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import { appendReconsiderationEvent, type ReconsiderationEventType } from "./events";

/**
 * PNOS F5.14 — TPA reconsideration triage + information flow.
 *
 * The reviewer side of a governed reconsideration case (F5.11/F5.12). An authorized reviewer:
 *   • triages jurisdiction — accepts the case (SUBMITTED → TRIAGE);
 *   • assigns an owner (→ UNDER_REVIEW) with a separation-of-duty RULE — assigning the reviewer
 *     who made the original decision is refused unless self-review is explicitly acknowledged;
 *   • runs the structured information exchange (INFORMATION_REQUIRED ↔ PROVIDER_RESPONDED);
 *   • records internal notes kept OUT of provider-facing state (§9).
 *
 * Every mutation is guarded by expected version + from-status (optimistic concurrency ⇒ a stale
 * action is refused, never a silent overwrite) and appends a ClaimReconsiderationEvent; the
 * provider-facing step enqueues a SAFE notification. NO financial outcome here (D13) — corrected
 * entitlement / award / uphold / execute is F5.15–F5.16; the original claim is never touched.
 *
 * Authorization: the admin action calls requireRole(ROLES.CLINICAL) and passes the resolved
 * actor; the service re-asserts reviewer-role membership as defence-in-depth (never importing
 * next-auth into a unit-testable service). The provider response authorizes through the F1.3
 * ProviderAccessContext (ownership + branch + permission), non-enumerating on a miss (§9.1).
 */

/** Reviewer roles permitted to triage/assign/request info (= ROLES.CLINICAL, as literals so the
 *  service carries no next-auth import). The action's requireRole is the primary gate. */
export const RECONSIDERATION_REVIEWER_ROLES = ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"] as const;

const RECONSIDER_PROVIDER_PERMISSION = "provider.claim.reconsider";

/** Non-terminal, pre-outcome states a reviewer works (F5.16 owns ACCEPTED/PARTIALLY_ACCEPTED/UPHELD). */
const ACTIVE_REVIEW_STATUSES: ReconsiderationStatus[] = ["SUBMITTED", "TRIAGE", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED", "UNDER_REVIEW"];
const TRIAGE_FROM: ReconsiderationStatus[] = ["SUBMITTED"];
const ASSIGN_FROM: ReconsiderationStatus[] = ["TRIAGE", "UNDER_REVIEW", "PROVIDER_RESPONDED"];
const REQUEST_INFO_FROM: ReconsiderationStatus[] = ["TRIAGE", "UNDER_REVIEW", "PROVIDER_RESPONDED"];
const RESUME_FROM: ReconsiderationStatus[] = ["PROVIDER_RESPONDED"];

export interface ReconsiderationReviewerActor {
  tenantId: string;
  userId: string;
  role: string;
}

export type ReconsiderationReviewErrorCode = "NOT_FOUND" | "FORBIDDEN" | "STALE" | "INVALID_STATE" | "INVALID";

export class ReconsiderationReviewError extends Error {
  constructor(public code: ReconsiderationReviewErrorCode, message: string) {
    super(message);
    this.name = "ReconsiderationReviewError";
  }
}
export function isReconsiderationReviewError(e: unknown): e is ReconsiderationReviewError {
  return e instanceof ReconsiderationReviewError;
}

interface ReviewerCaseFacts {
  id: string;
  tenantId: string;
  providerId: string;
  providerBranchId: string | null;
  claimId: string;
  status: ReconsiderationStatus;
  version: number;
  assignedReviewerId: string | null;
  originalAdjudicatorId: string | null;
}

const CASE_FACTS_SELECT = {
  id: true, tenantId: true, providerId: true, providerBranchId: true, claimId: true,
  status: true, version: true, assignedReviewerId: true, originalAdjudicatorId: true,
} as const;

export interface ReviewerReconsiderationRow {
  id: string;
  claimId: string;
  providerId: string;
  providerBranchId: string | null;
  status: ReconsiderationStatus;
  reasonCode: string;
  requestedAmount: string;
  currency: string;
  filingDeadline: Date | null;
  filedAt: Date | null;
  dueAt: Date | null;
  assignedReviewerId: string | null;
  originalAdjudicatorId: string | null;
  version: number;
}

export interface ReviewTransitionResult {
  status: ReconsiderationStatus;
  version: number;
}

function assertReviewer(actor: ReconsiderationReviewerActor): void {
  if (!(RECONSIDERATION_REVIEWER_ROLES as readonly string[]).includes(actor.role)) {
    throw new ReconsiderationReviewError("FORBIDDEN", "You do not have permission to review reconsiderations.");
  }
}

async function loadCase(tenantId: string, id: string): Promise<ReviewerCaseFacts> {
  const rc = await prisma.claimReconsideration.findFirst({ where: { id, tenantId }, select: CASE_FACTS_SELECT });
  if (!rc) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
  return rc;
}

interface TransitionSpec {
  from: ReconsiderationStatus[];
  to: ReconsiderationStatus;
  data?: Prisma.ClaimReconsiderationUpdateManyMutationInput;
  eventType: ReconsiderationEventType;
  message?: string | null;
  safeReasonCode?: string | null;
  internalReasonRef?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  auditAction: string;
  auditDescription: string;
  auditPayload?: Record<string, unknown>;
}

/**
 * Status- and version-guarded transition: a single CAS updateMany flips the status only when the
 * row still matches the expected version AND a permitted from-status. On zero rows we re-read to
 * classify (NOT_FOUND / STALE / INVALID_STATE) — never a blind overwrite. Event + audit follow.
 */
async function runTransition(
  actor: ReconsiderationReviewerActor,
  facts: ReviewerCaseFacts,
  expectedVersion: number,
  spec: TransitionSpec,
): Promise<ReviewTransitionResult> {
  const result = await prisma.$transaction(async (tx) => {
    const cas = await tx.claimReconsideration.updateMany({
      where: { id: facts.id, tenantId: actor.tenantId, version: expectedVersion, status: { in: spec.from } },
      data: { ...(spec.data ?? {}), status: spec.to, version: { increment: 1 } },
    });
    if (cas.count === 0) {
      const cur = await tx.claimReconsideration.findFirst({ where: { id: facts.id, tenantId: actor.tenantId }, select: { status: true, version: true } });
      if (!cur) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
      if (cur.version !== expectedVersion) throw new ReconsiderationReviewError("STALE", "This reconsideration changed since you loaded it — refresh and retry.");
      throw new ReconsiderationReviewError("INVALID_STATE", `A ${cur.status.toLowerCase().replace(/_/g, " ")} reconsideration cannot take this action.`);
    }
    const fresh = await tx.claimReconsideration.findFirst({ where: { id: facts.id }, select: { version: true } });
    await appendReconsiderationEvent(
      {
        tenantId: actor.tenantId,
        reconsiderationId: facts.id,
        eventType: spec.eventType,
        priorStatus: facts.status,
        newStatus: spec.to,
        message: spec.message ?? null,
        safeReasonCode: spec.safeReasonCode ?? null,
        internalReasonRef: spec.internalReasonRef ?? null,
        metadata: spec.metadata ?? null,
        actorType: "USER",
        actorId: actor.userId,
      },
      tx,
    );
    return { status: spec.to, version: fresh?.version ?? expectedVersion + 1 };
  });

  await auditChainService.append({
    actorId: actor.userId,
    action: spec.auditAction,
    module: "CLAIMS",
    entityType: "ClaimReconsideration",
    entityId: facts.id,
    tenantId: actor.tenantId,
    payload: { claimId: facts.claimId, ...(spec.auditPayload ?? {}) },
    description: spec.auditDescription,
  });
  return result;
}

export const ReconsiderationReviewService = {
  /** The reviewer work list — active cases in the tenant, most SLA-urgent first. Staff-facing
   *  (carries the internal assignment/adjudicator refs); optional status / owner / provider filter. */
  async queue(
    actor: ReconsiderationReviewerActor,
    opts: { status?: ReconsiderationStatus; assignedReviewerId?: string; providerId?: string; take?: number } = {},
  ): Promise<ReviewerReconsiderationRow[]> {
    assertReviewer(actor);
    const rows = await prisma.claimReconsideration.findMany({
      where: {
        tenantId: actor.tenantId,
        status: opts.status ? opts.status : { in: ACTIVE_REVIEW_STATUSES },
        ...(opts.assignedReviewerId ? { assignedReviewerId: opts.assignedReviewerId } : {}),
        ...(opts.providerId ? { providerId: opts.providerId } : {}),
      },
      orderBy: [{ dueAt: "asc" }, { filedAt: "asc" }],
      take: Math.min(Math.max(opts.take ?? 100, 1), 200),
      select: {
        id: true, claimId: true, providerId: true, providerBranchId: true, status: true, reasonCode: true,
        requestedAmount: true, currency: true, filingDeadline: true, filedAt: true, dueAt: true,
        assignedReviewerId: true, originalAdjudicatorId: true, version: true,
      },
    });
    return rows.map((r) => ({ ...r, requestedAmount: r.requestedAmount.toString() }));
  },

  /** Accept jurisdiction (SUBMITTED → TRIAGE). */
  async triage(actor: ReconsiderationReviewerActor, id: string, params: { expectedVersion: number }): Promise<ReviewTransitionResult> {
    assertReviewer(actor);
    const facts = await loadCase(actor.tenantId, id);
    return runTransition(actor, facts, params.expectedVersion, {
      from: TRIAGE_FROM,
      to: "TRIAGE",
      eventType: "TRIAGED",
      auditAction: "RECONSIDERATION:TRIAGE",
      auditDescription: "Reconsideration triaged; jurisdiction accepted.",
    });
  },

  /**
   * Assign an owner (→ UNDER_REVIEW). Separation-of-duty RULE: if the assignee made the original
   * decision, the assignment is refused unless `acknowledgeSelfReview` is set — and the returned
   * `sodWarning` lets the caller surface a prominent banner. The assignee is an internal ref.
   */
  async assign(
    actor: ReconsiderationReviewerActor,
    id: string,
    params: { expectedVersion: number; reviewerId: string; assignedTeam?: string; acknowledgeSelfReview?: boolean },
  ): Promise<ReviewTransitionResult & { sodWarning: boolean }> {
    assertReviewer(actor);
    const reviewerId = (params.reviewerId ?? "").trim();
    if (!reviewerId) throw new ReconsiderationReviewError("INVALID", "A reviewer must be selected.");
    const facts = await loadCase(actor.tenantId, id);
    const sodWarning = facts.originalAdjudicatorId != null && facts.originalAdjudicatorId === reviewerId;
    if (sodWarning && !params.acknowledgeSelfReview) {
      throw new ReconsiderationReviewError(
        "INVALID",
        "This reviewer decided the original claim — assigning them requires an explicit separation-of-duty acknowledgment.",
      );
    }
    const r = await runTransition(actor, facts, params.expectedVersion, {
      from: ASSIGN_FROM,
      to: "UNDER_REVIEW",
      data: { assignedReviewerId: reviewerId, ...(params.assignedTeam ? { assignedTeam: params.assignedTeam } : {}) },
      eventType: "ASSIGNED",
      internalReasonRef: reviewerId,
      metadata: { reassigned: facts.assignedReviewerId != null, selfReview: sodWarning },
      auditAction: "RECONSIDERATION:ASSIGN",
      auditDescription: `Reconsideration assigned to a reviewer${sodWarning ? " (self-review acknowledged)" : ""}.`,
      auditPayload: { reviewerId, selfReview: sodWarning },
    });
    return { ...r, sodWarning };
  },

  /** Request structured information from the provider (→ INFORMATION_REQUIRED). The prompt is
   *  provider-facing (safe) and drives the timeline + a safe notification. */
  async requestInformation(
    actor: ReconsiderationReviewerActor,
    id: string,
    params: { expectedVersion: number; prompt: string },
  ): Promise<ReviewTransitionResult> {
    assertReviewer(actor);
    const prompt = (params.prompt ?? "").trim();
    if (!prompt) throw new ReconsiderationReviewError("INVALID", "An information request needs a prompt for the provider.");
    const facts = await loadCase(actor.tenantId, id);
    const r = await runTransition(actor, facts, params.expectedVersion, {
      from: REQUEST_INFO_FROM,
      to: "INFORMATION_REQUIRED",
      eventType: "INFO_REQUESTED",
      message: prompt,
      auditAction: "RECONSIDERATION:REQUEST_INFO",
      auditDescription: "Information requested from the provider on a reconsideration.",
    });
    const claim = await prisma.claim.findFirst({ where: { id: facts.claimId, tenantId: actor.tenantId }, select: { claimNumber: true } });
    await NotificationOutboxService.enqueue({
      tenantId: actor.tenantId,
      providerId: facts.providerId,
      channel: "IN_APP",
      eventType: "RECONSIDERATION_INFO_REQUESTED",
      priority: "NORMAL",
      title: "Information requested",
      body: `Additional information was requested for your reconsideration on claim ${claim?.claimNumber ?? ""}.`.trim(),
      href: `/provider/claims/${facts.claimId}`,
      metadata: { reconsiderationId: id, claimId: facts.claimId },
      dedupeKey: `reconsideration-info:${id}:${r.version}`,
    }).catch(() => undefined);
    return r;
  },

  /** Provider answers a pending information request (INFORMATION_REQUIRED → PROVIDER_RESPONDED).
   *  Provider-authorized (ownership + branch + permission), non-enumerating on a miss. */
  async respondToInformation(
    ctx: ProviderAccessContext,
    id: string,
    params: { response: string; expectedVersion?: number },
  ): Promise<ReviewTransitionResult> {
    ProviderAccessService.requirePermission(ctx, RECONSIDER_PROVIDER_PERMISSION);
    const response = (params.response ?? "").trim();
    if (!response) throw new ReconsiderationReviewError("INVALID", "A response is required.");
    const rc = await prisma.claimReconsideration.findFirst({
      where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: { id: true, status: true, version: true, providerBranchId: true, claimId: true },
    });
    // Non-enumerating: a case outside this provider's scope is indistinguishable from absent.
    if (!rc) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
    if (rc.providerBranchId && !ProviderAccessService.hasBranch(ctx, rc.providerBranchId)) {
      throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const cas = await tx.claimReconsideration.updateMany({
        where: {
          id, tenantId: ctx.tenantId, providerId: ctx.providerId, status: "INFORMATION_REQUIRED",
          ...(params.expectedVersion != null ? { version: params.expectedVersion } : {}),
        },
        data: { status: "PROVIDER_RESPONDED", version: { increment: 1 } },
      });
      if (cas.count === 0) {
        const cur = await tx.claimReconsideration.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { status: true, version: true } });
        if (!cur) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
        if (params.expectedVersion != null && cur.version !== params.expectedVersion) {
          throw new ReconsiderationReviewError("STALE", "This reconsideration changed since you loaded it — refresh and retry.");
        }
        throw new ReconsiderationReviewError("INVALID_STATE", "This reconsideration is not awaiting your response.");
      }
      const fresh = await tx.claimReconsideration.findFirst({ where: { id }, select: { version: true } });
      await appendReconsiderationEvent(
        {
          tenantId: ctx.tenantId,
          reconsiderationId: id,
          eventType: "PROVIDER_RESPONDED",
          priorStatus: "INFORMATION_REQUIRED",
          newStatus: "PROVIDER_RESPONDED",
          message: response,
          actorType: "PROVIDER",
          actorId: ctx.actorId,
        },
        tx,
      );
      return { status: "PROVIDER_RESPONDED" as const, version: fresh?.version ?? (rc.version + 1) };
    });

    await auditChainService.append({
      actorId: ctx.actorId,
      action: "RECONSIDERATION:PROVIDER_RESPOND",
      module: "CLAIMS",
      entityType: "ClaimReconsideration",
      entityId: id,
      tenantId: ctx.tenantId,
      payload: { claimId: rc.claimId },
      description: "Provider responded to a reconsideration information request.",
    });
    return result;
  },

  /** Reviewer resumes review after a provider response (PROVIDER_RESPONDED → UNDER_REVIEW). */
  async resumeReview(actor: ReconsiderationReviewerActor, id: string, params: { expectedVersion: number }): Promise<ReviewTransitionResult> {
    assertReviewer(actor);
    const facts = await loadCase(actor.tenantId, id);
    return runTransition(actor, facts, params.expectedVersion, {
      from: RESUME_FROM,
      to: "UNDER_REVIEW",
      eventType: "UNDER_REVIEW",
      auditAction: "RECONSIDERATION:RESUME",
      auditDescription: "Reconsideration review resumed after the provider response.",
    });
  },

  /**
   * Record an internal reviewer note (§9 — kept OUT of provider-facing state). Appends an
   * INTERNAL_NOTE event; the provider timeline (F5.11) drops the event type AND withholds message
   * text for it, so the note never reaches the provider. No status/version change.
   */
  async addInternalNote(actor: ReconsiderationReviewerActor, id: string, params: { note: string }): Promise<void> {
    assertReviewer(actor);
    const note = (params.note ?? "").trim();
    if (!note) throw new ReconsiderationReviewError("INVALID", "An internal note cannot be empty.");
    const facts = await loadCase(actor.tenantId, id);
    if (!ACTIVE_REVIEW_STATUSES.includes(facts.status)) {
      throw new ReconsiderationReviewError("INVALID_STATE", "Notes can only be added while the case is under review.");
    }
    await appendReconsiderationEvent({
      tenantId: actor.tenantId,
      reconsiderationId: id,
      eventType: "INTERNAL_NOTE",
      message: note,
      actorType: "USER",
      actorId: actor.userId,
    });
    await auditChainService.append({
      actorId: actor.userId,
      action: "RECONSIDERATION:NOTE",
      module: "CLAIMS",
      entityType: "ClaimReconsideration",
      entityId: id,
      tenantId: actor.tenantId,
      payload: { claimId: facts.claimId },
      description: "Internal note recorded on a reconsideration.",
    });
  },
} as const;

export { ProviderAccessError };
