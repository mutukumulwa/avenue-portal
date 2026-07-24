import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createWithDocumentNumber } from "@/lib/document-number";
import { ProviderEntitlementService } from "../provider-entitlement.service";
import { ProviderAccessSettingsService } from "../provider-access-settings.service";
import { appendPreauthEvent } from "./events";
import {
  normalizePreauth, validatePreauth, resolveProviderId, preauthRequestHash,
  PREAUTH_CONTRACT_VERSION,
  type PreauthCallerContext, type PreauthSubmissionV1, type PreauthIntakeResult, type NormalizedPreauthV1,
} from "./contract";

/**
 * PNOS F3.3 — canonical PreauthIntakeService.
 *
 * The ONE transaction-aware entry that normalizes, validates, idempotently
 * creates a PA + intake receipt + SUBMITTED event, applies the SLA, and hands
 * off to the EXISTING adjudication owner. It never decides and never touches a
 * benefit hold (D5/D6) — the decision/hold owner is preauthAdjudicationService,
 * invoked post-commit through an injectable port so this service stays testable
 * without running the real engine. No existing rail is migrated here (F3.4/F3.5).
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Post-commit handoff to the canonical decision/hold owner. */
export interface PreauthIntakeDeps {
  /** Runs auto/human adjudication for the freshly-created PA. Must be idempotent. */
  adjudicate: (preAuthId: string, tenantId: string) => Promise<void>;
}

export class PreauthIntakeConflict extends Error {
  constructor(public receiptId: string) {
    super("Idempotency key reused with a different request");
    this.name = "PreauthIntakeConflict";
  }
}

const SLA_MINUTES = { EMERGENCY: 30, INPATIENT: 60, OUTPATIENT: 120 } as const;

/** Initial submission SLA clock — mirrors preauthAdjudicationService.SLA_MINUTES. */
function preauthSlaDeadline(serviceType: string | null, now: Date): Date {
  const minutes = serviceType === "EMERGENCY" ? SLA_MINUTES.EMERGENCY : serviceType === "INPATIENT" ? SLA_MINUTES.INPATIENT : SLA_MINUTES.OUTPATIENT;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function submittedByFor(channel: PreauthCallerContext["channel"]): string {
  if (channel === "MEMBER_APP") return "MEMBER";
  if (channel === "ADMIN_PORTAL" || channel === "ADMIN_TRPC") return "ADMIN";
  return "PROVIDER"; // provider portal/api, amendment
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

async function resolveMember(db: Db, ctx: PreauthCallerContext, n: NormalizedPreauthV1, providerId: string | null) {
  const at = n.expectedDateOfService ? new Date(n.expectedDateOfService) : new Date();
  const enforced = providerId ? await ProviderAccessSettingsService.isEntitlementEnforced(ctx.tenantId, providerId, db) : false;
  const scope = enforced && providerId ? await ProviderEntitlementService.entitledMemberWhere(providerId, at) : {};
  const select = { id: true, status: true, groupId: true, group: { select: { clientId: true } } } as const;
  if (n.memberId) {
    return db.member.findFirst({ where: { id: n.memberId, tenantId: ctx.tenantId, ...scope }, select });
  }
  if (n.memberNumber) {
    return db.member.findFirst({ where: { memberNumber: { equals: n.memberNumber, mode: "insensitive" }, tenantId: ctx.tenantId, ...scope }, select });
  }
  return null;
}

export const PreauthIntakeService = {
  async submit(ctx: PreauthCallerContext, submission: PreauthSubmissionV1, deps: PreauthIntakeDeps, db: Db = prisma): Promise<PreauthIntakeResult> {
    const now = new Date();
    const requestId = ctx.requestId ?? randomUUID();
    const { normalized, dateInvalid } = normalizePreauth(submission);
    const requestHash = preauthRequestHash(ctx, normalized);
    const providerId = resolveProviderId(ctx, normalized).providerId;
    // fall back to the content hash so a caller that omits an idempotency key
    // still de-dupes an identical resubmission
    const idempotencyKey = (submission.idempotencyKey ?? "").trim() || requestHash;

    const receiptScope = { actorType: ctx.actorType, actorId: ctx.actorId, credentialId: undefined as string | undefined, channel: ctx.channel, tenantId: ctx.tenantId, requestId };

    // ── replay / conflict on an existing receipt ────────────────────────────
    if (providerId) {
      const existing = await db.preauthIntakeReceipt.findUnique({
        where: { tenantId_providerId_channel_idempotencyKey: { tenantId: ctx.tenantId, providerId, channel: ctx.channel, idempotencyKey } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new PreauthIntakeConflict(existing.id);
        return {
          receiptId: existing.id,
          status: existing.preAuthorizationId ? "ACCEPTED" : "REJECTED",
          replayed: true,
          preauthId: existing.preAuthorizationId ?? undefined,
        };
      }
    }

    // ── structural validation → REJECTED receipt (no PA) ────────────────────
    const errors = validatePreauth(ctx, normalized, { dateInvalid });
    const rejectWith = async (failureCode: string, errs = errors) => {
      const r = await db.preauthIntakeReceipt.create({
        data: { ...receiptScope, providerId, clientId: null, memberId: null, providerBranchId: ctx.providerBranchId ?? null, idempotencyKey, requestHash, status: "REJECTED", failureCode },
      });
      return { receiptId: r.id, status: "REJECTED" as const, replayed: false, errors: errs };
    };
    if (errors.length) return rejectWith(errors[0].code);

    // ── eligibility / entitlement / provider gates ──────────────────────────
    const member = await resolveMember(db, ctx, normalized, providerId);
    if (!member) return rejectWith("MEMBER_NOT_FOUND", [{ code: "MISSING_MEMBER_IDENTIFIER", message: "No eligible member found" }]);
    if (member.status !== "ACTIVE") return rejectWith("MEMBER_NOT_ACTIVE", [{ code: "MISSING_MEMBER_IDENTIFIER", message: "Member is not active" }]);
    const provider = await db.provider.findFirst({ where: { id: providerId!, tenantId: ctx.tenantId }, select: { contractStatus: true } });
    if (!provider || provider.contractStatus !== "ACTIVE") return rejectWith("PROVIDER_NOT_ACTIVE", [{ code: "MISSING_PROVIDER", message: "Provider is not active" }]);

    // ── atomic: PA + receipt(PROCESSING) + SUBMITTED event ──────────────────
    let created: { paId: string; receiptId: string };
    try {
      created = await db.$transaction(async (tx) => {
        const pa = await createWithDocumentNumber(
          "PA",
          (yp) => tx.preAuthorization.findFirst({ where: { tenantId: ctx.tenantId, preauthNumber: { startsWith: yp } }, orderBy: { preauthNumber: "desc" }, select: { preauthNumber: true } }).then((r) => r?.preauthNumber ?? null),
          (preauthNumber) => tx.preAuthorization.create({
            data: {
              tenantId: ctx.tenantId, preauthNumber, memberId: member.id, providerId: providerId!,
              submittedBy: submittedByFor(ctx.channel), diagnoses: normalized.diagnoses as unknown as Prisma.InputJsonValue,
              procedures: normalized.procedures as unknown as Prisma.InputJsonValue, estimatedCost: normalized.estimatedCost,
              clinicalNotes: normalized.clinicalNotes, benefitCategory: normalized.benefitCategory!,
              serviceType: normalized.serviceType ?? "OUTPATIENT",
              expectedDateOfService: normalized.expectedDateOfService ? new Date(normalized.expectedDateOfService) : null,
              status: "SUBMITTED", slaDeadlineAt: preauthSlaDeadline(normalized.serviceType, now),
            },
            select: { id: true },
          }),
        );
        const receipt = await tx.preauthIntakeReceipt.create({
          data: { ...receiptScope, providerId, clientId: member.group?.clientId ?? null, memberId: member.id, providerBranchId: ctx.providerBranchId ?? null, idempotencyKey, requestHash, status: "PROCESSING", preAuthorizationId: pa.id },
        });
        await appendPreauthEvent({ tenantId: ctx.tenantId, preAuthorizationId: pa.id, eventType: "SUBMITTED", newStatus: "SUBMITTED", actorType: ctx.actorType, actorId: ctx.actorId, dataVersionRef: PREAUTH_CONTRACT_VERSION, metadata: { channel: ctx.channel } }, tx);
        return { paId: pa.id, receiptId: receipt.id };
      });
    } catch (e) {
      // a concurrent submit won the receipt idempotency race → replay the winner
      if (isUniqueViolation(e) && providerId) {
        const winner = await db.preauthIntakeReceipt.findUnique({ where: { tenantId_providerId_channel_idempotencyKey: { tenantId: ctx.tenantId, providerId, channel: ctx.channel, idempotencyKey } } });
        if (winner) {
          if (winner.requestHash !== requestHash) throw new PreauthIntakeConflict(winner.id);
          return { receiptId: winner.id, status: winner.preAuthorizationId ? "ACCEPTED" : "REJECTED", replayed: true, preauthId: winner.preAuthorizationId ?? undefined };
        }
      }
      throw e;
    }

    // ── post-commit handoff to the canonical decision/hold owner ────────────
    // The PA + receipt are already durable. A handoff failure leaves the receipt
    // PROCESSING and the PA SUBMITTED (visible + retryable) — never a lost
    // submission and never a duplicate hold/decision (the port must be idempotent).
    try {
      await deps.adjudicate(created.paId, ctx.tenantId);
      await db.preauthIntakeReceipt.update({ where: { id: created.receiptId }, data: { status: "ACCEPTED" } });
    } catch {
      await appendPreauthEvent({ tenantId: ctx.tenantId, preAuthorizationId: created.paId, eventType: "ASSIGNED", safeReasonCode: "AUTO_DECISION_DEFERRED", actorType: "SYSTEM", metadata: { deferred: true } }, db).catch(() => {});
      // receipt stays PROCESSING — a sweeper/operator retries adjudication
    }

    return { receiptId: created.receiptId, status: "ACCEPTED", replayed: false, preauthId: created.paId };
  },
} as const;
