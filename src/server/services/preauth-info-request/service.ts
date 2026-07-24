import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { appendPreauthEvent } from "../preauth-intake/events";
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
} as const;
