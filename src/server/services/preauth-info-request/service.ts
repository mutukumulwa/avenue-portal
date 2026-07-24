import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, PreauthInfoRequestStatus } from "@prisma/client";
import { appendPreauthEvent, type PreauthEventType } from "../preauth-intake/events";
import { normalizeRequestedItems } from "./catalog";

/**
 * PNOS F4.2 — clinical information-request open/cancel service.
 *
 * The reviewer-side lifecycle entry: OPEN a request for more clinical information
 * on a pre-authorization, and CANCEL (withdraw) one. Provider response (F4.3) and
 * reviewer accept/reopen/close (F4.4) are separate packages. Each transition is
 * atomic with a SAFE PA event (F3.2) so the PA timeline stays complete — event
 * metadata carries ids/counts only, never the prompt or clinical text. This
 * service does NOT change the PA's own status (that stays with the adjudication
 * owner); the info request tracks the sub-state.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Info can only be requested while the PA is still pre-decision. */
export const INFO_REQUEST_OPENABLE_PA_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];
/** A request may be withdrawn until it is accepted/closed. */
export const INFO_REQUEST_CANCELLABLE_STATUSES = ["OPEN", "RESPONDED", "REOPENED"];
/** The provider may respond only while the request is awaiting them. */
export const INFO_REQUEST_RESPONDABLE_STATUSES = ["OPEN", "REOPENED"];
/** The reviewer acts on a submitted response. */
export const INFO_REQUEST_ACCEPTABLE_STATUSES = ["RESPONDED"];
export const INFO_REQUEST_REOPENABLE_STATUSES = ["RESPONDED"];
/** Close is allowed from any live (non-terminal) state. */
export const INFO_REQUEST_CLOSABLE_STATUSES = ["OPEN", "RESPONDED", "REOPENED", "ACCEPTED"];
export const DEFAULT_INFO_REQUEST_DUE_HOURS = 72;

export class InfoRequestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "InfoRequestError";
  }
}

export interface OpenInfoRequestParams {
  tenantId: string;
  preAuthorizationId: string;
  requestedItems: unknown; // caller-supplied; normalized against the catalog
  prompt: string;
  actor: { type: string; id?: string };
  dueInHours?: number;
}

export interface CancelInfoRequestParams {
  tenantId: string;
  id: string;
  actor: { type: string; id?: string };
  reason?: string;
}

export interface InfoRequestDecisionParams {
  tenantId: string;
  id: string;
  actor: { type: string; id?: string };
  note?: string;
}

/** Shared reviewer transition (accept/reopen/close): guard the from-state, flip the
 * status with decision actor/timestamp, and append the matching PA event. */
async function applyDecision(
  db: Db,
  params: InfoRequestDecisionParams,
  spec: { from: string[]; to: PreauthInfoRequestStatus; event: PreauthEventType; errCode: string; errMsg: string },
) {
  const existing = await db.preauthInfoRequest.findFirst({
    where: { id: params.id, tenantId: params.tenantId },
    select: { id: true, status: true, preAuthorizationId: true },
  });
  if (!existing) throw new InfoRequestError("NOT_FOUND", "Information request not found.");
  if (!spec.from.includes(existing.status)) {
    throw new InfoRequestError(spec.errCode, `A ${existing.status.toLowerCase()} information request ${spec.errMsg}.`);
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.preauthInfoRequest.update({
      where: { id: existing.id },
      data: { status: spec.to, decisionByActorId: params.actor.id ?? null, decidedAt: new Date(), decisionNote: (params.note ?? "").trim() || null },
    });
    await appendPreauthEvent(
      {
        tenantId: params.tenantId,
        preAuthorizationId: existing.preAuthorizationId,
        eventType: spec.event,
        actorType: params.actor.type,
        actorId: params.actor.id ?? null,
        metadata: { infoRequestId: existing.id },
      },
      tx,
    );
    return updated;
  });
}

export const PreauthInfoRequestService = {
  async open(params: OpenInfoRequestParams, db: Db = prisma) {
    const items = normalizeRequestedItems(params.requestedItems);
    if (items.length === 0) throw new InfoRequestError("NO_ITEMS", "Name at least one information item to request.");
    const prompt = (params.prompt ?? "").trim();
    if (!prompt) throw new InfoRequestError("NO_PROMPT", "Describe what information is needed.");

    const pa = await db.preAuthorization.findFirst({
      where: { id: params.preAuthorizationId, tenantId: params.tenantId },
      select: { id: true, status: true, providerId: true, memberId: true, member: { select: { group: { select: { clientId: true } } } } },
    });
    if (!pa) throw new InfoRequestError("PA_NOT_FOUND", "Pre-authorization not found.");
    if (!INFO_REQUEST_OPENABLE_PA_STATUSES.includes(pa.status)) {
      throw new InfoRequestError("PA_NOT_OPENABLE", `Information cannot be requested on a ${pa.status.replace(/_/g, " ").toLowerCase()} pre-authorization.`);
    }

    const dueAt = new Date(Date.now() + (params.dueInHours ?? DEFAULT_INFO_REQUEST_DUE_HOURS) * 3_600_000);

    return db.$transaction(async (tx) => {
      const last = await tx.preauthInfoRequest.findFirst({ where: { preAuthorizationId: pa.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const sequence = (last?.sequence ?? 0) + 1;
      const created = await tx.preauthInfoRequest.create({
        data: {
          tenantId: params.tenantId,
          preAuthorizationId: pa.id,
          providerId: pa.providerId,
          clientId: pa.member?.group?.clientId ?? null,
          memberId: pa.memberId,
          sequence,
          status: "OPEN",
          requestedItems: items,
          prompt,
          dueAt,
          openedByActorType: params.actor.type,
          openedByActorId: params.actor.id ?? null,
        },
      });
      await appendPreauthEvent(
        {
          tenantId: params.tenantId,
          preAuthorizationId: pa.id,
          eventType: "INFO_REQUESTED",
          actorType: params.actor.type,
          actorId: params.actor.id ?? null,
          metadata: { infoRequestId: created.id, sequence, itemCount: items.length },
        },
        tx,
      );
      return created;
    });
  },

  async cancel(params: CancelInfoRequestParams, db: Db = prisma) {
    const existing = await db.preauthInfoRequest.findFirst({
      where: { id: params.id, tenantId: params.tenantId },
      select: { id: true, status: true, preAuthorizationId: true },
    });
    if (!existing) throw new InfoRequestError("NOT_FOUND", "Information request not found.");
    if (!INFO_REQUEST_CANCELLABLE_STATUSES.includes(existing.status)) {
      throw new InfoRequestError("NOT_CANCELLABLE", `A ${existing.status.toLowerCase()} information request cannot be cancelled.`);
    }

    return db.$transaction(async (tx) => {
      const updated = await tx.preauthInfoRequest.update({
        where: { id: existing.id },
        data: {
          status: "CANCELLED",
          decisionByActorId: params.actor.id ?? null,
          decidedAt: new Date(),
          decisionNote: (params.reason ?? "").trim() || null,
        },
      });
      await appendPreauthEvent(
        {
          tenantId: params.tenantId,
          preAuthorizationId: existing.preAuthorizationId,
          eventType: "INFO_REQUEST_CANCELLED",
          actorType: params.actor.type,
          actorId: params.actor.id ?? null,
          metadata: { infoRequestId: existing.id },
        },
        tx,
      );
      return updated;
    });
  },

  /**
   * F4.3 — the provider explicitly submits a response to a request awaiting them.
   * The draft is client-side form state (F4.7); the server persists ONLY the
   * explicitly-submitted response. When `providerId` is passed (the provider
   * surface), the request must belong to that facility — otherwise a non-
   * enumerating NOT_FOUND (no cross-provider probing). Atomic with a
   * RESPONSE_SUBMITTED PA event (safe metadata; the response text stays on the row).
   */
  async submitResponse(
    params: { tenantId: string; id: string; providerId?: string; responseNote: string; actor: { type: string; id?: string } },
    db: Db = prisma,
  ) {
    const note = (params.responseNote ?? "").trim();
    if (!note) throw new InfoRequestError("NO_RESPONSE", "Enter a response before submitting.");

    const existing = await db.preauthInfoRequest.findFirst({
      where: { id: params.id, tenantId: params.tenantId, ...(params.providerId ? { providerId: params.providerId } : {}) },
      select: { id: true, status: true, preAuthorizationId: true },
    });
    if (!existing) throw new InfoRequestError("NOT_FOUND", "Information request not found.");
    if (!INFO_REQUEST_RESPONDABLE_STATUSES.includes(existing.status)) {
      throw new InfoRequestError("NOT_RESPONDABLE", `A ${existing.status.toLowerCase()} information request is not awaiting a response.`);
    }

    return db.$transaction(async (tx) => {
      const updated = await tx.preauthInfoRequest.update({
        where: { id: existing.id },
        data: { status: "RESPONDED", responseNote: note, respondedByActorId: params.actor.id ?? null, respondedAt: new Date() },
      });
      await appendPreauthEvent(
        {
          tenantId: params.tenantId,
          preAuthorizationId: existing.preAuthorizationId,
          eventType: "RESPONSE_SUBMITTED",
          actorType: params.actor.type,
          actorId: params.actor.id ?? null,
          metadata: { infoRequestId: existing.id },
        },
        tx,
      );
      return updated;
    });
  },

  // F4.4 — reviewer decisions on a submitted response. accept ⇒ sanctions claim
  // reprocessing (F4.5). reopen ⇒ back to the provider. close ⇒ terminal.
  async accept(params: InfoRequestDecisionParams, db: Db = prisma) {
    return applyDecision(db, params, { from: INFO_REQUEST_ACCEPTABLE_STATUSES, to: "ACCEPTED", event: "RESPONSE_ACCEPTED", errCode: "NOT_ACCEPTABLE", errMsg: "cannot be accepted" });
  },

  async reopen(params: InfoRequestDecisionParams, db: Db = prisma) {
    return applyDecision(db, params, { from: INFO_REQUEST_REOPENABLE_STATUSES, to: "REOPENED", event: "RESPONSE_REOPENED", errCode: "NOT_REOPENABLE", errMsg: "cannot be reopened" });
  },

  async close(params: InfoRequestDecisionParams, db: Db = prisma) {
    return applyDecision(db, params, { from: INFO_REQUEST_CLOSABLE_STATUSES, to: "CLOSED", event: "INFO_REQUEST_CLOSED", errCode: "NOT_CLOSABLE", errMsg: "cannot be closed" });
  },

  /**
   * F4.5 — "sanctioned reprocessing" read (per the ratified decision: mark sanctioned,
   * human re-decides — NO automatic pipeline re-run). Surfaces PAs whose information
   * request was ACCEPTED (the acceptance is the sanction; RESPONSE_ACCEPTED is its
   * event) while the PA itself is still UNDECIDED — i.e. it now has the requested
   * information and is awaiting a human re-decision on the existing PA workbench.
   * Scoped like the F3.7 read model (client confinement; provider filter optional).
   * This never decides a PA and never touches a hold — it only lists work.
   */
  async listReprocessable(
    scope: { tenantId: string; clientId?: string | null; providerId?: string },
    db: Db = prisma,
  ): Promise<Array<{ preAuthorizationId: string; infoRequestId: string; acceptedAt: Date | null }>> {
    const accepted = await db.preauthInfoRequest.findMany({
      where: {
        tenantId: scope.tenantId,
        status: "ACCEPTED",
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
        ...(scope.providerId ? { providerId: scope.providerId } : {}),
      },
      select: { id: true, preAuthorizationId: true, decidedAt: true },
      orderBy: { decidedAt: "desc" },
    });
    if (accepted.length === 0) return [];

    // Which of those PAs are still awaiting a decision (SUBMITTED/UNDER_REVIEW)?
    const paIds = [...new Set(accepted.map((a) => a.preAuthorizationId))];
    const undecided = await db.preAuthorization.findMany({
      where: { id: { in: paIds }, tenantId: scope.tenantId, status: { in: INFO_REQUEST_OPENABLE_PA_STATUSES as never } },
      select: { id: true },
    });
    const undecidedSet = new Set(undecided.map((p) => p.id));

    return accepted
      .filter((a) => undecidedSet.has(a.preAuthorizationId))
      .map((a) => ({ preAuthorizationId: a.preAuthorizationId, infoRequestId: a.id, acceptedAt: a.decidedAt }));
  },

  /**
   * F4.7 — provider-scoped single-request read for the inbox detail page.
   * Non-enumerating: a request not belonging to this facility resolves to null.
   */
  async getForProvider(scope: { tenantId: string; providerId: string }, id: string, db: Db = prisma) {
    return db.preauthInfoRequest.findFirst({ where: { id, tenantId: scope.tenantId, providerId: scope.providerId } });
  },
} as const;
