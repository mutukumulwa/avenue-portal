import { prisma } from "@/lib/prisma";
import { getSystemActorId } from "./system-actor.service";
import { BenefitUsageService } from "./benefit-usage.service";
import { ClaimIntakeService } from "./claim-intake/intake.service";
import { IntakeError } from "./claim-intake/errors";
import { processAcceptedRunInline } from "./claim-intake";

/**
 * Store-and-forward sync rail (Medvex spec §4 / gap G4).
 *
 * `ingest()` durably buffers client-captured operations idempotently (by
 * opKey), so retries never double-apply. `reconcile()` is the server pipeline
 * run per operation on reconnect:
 *   1. idempotency drop  — already applied? skip.
 *   2. authoritative re-validation (against live eligibility/balances).
 *   3. deterministic conflict resolution (re-sequence decrements by clinical
 *      event time; insufficient balance → CONFLICT for review, never silently
 *      paid or dropped).
 *   4. adjudication hand-off (feeds the claim/pre-auth engines).
 *   5. audit-chain entry with the provisional-vs-final delta.
 *
 * Steps 2-4 are scaffolded here (structure + state machine + idempotency real;
 * entity-specific logic lands in Phase 1). The point is: no data loss, every op
 * reaches a terminal state (SYNCED | CONFLICT | REJECTED), and retries are safe.
 */

export interface IncomingOp {
  clientUuid: string;
  opKey: string;
  entityType: string; // "CheckIn" | "PreAuth" | "Claim" | "Image"
  payload: unknown;
  deviceId?: string;
  capturedAt: string | Date;
}

export class SyncService {
  /**
   * Durably buffer operations. Idempotent: an opKey already seen is returned as
   * `duplicate` and not re-inserted. Returns per-op outcome for the client to
   * mark its local records synced/queued.
   *
   * WP-B4: `offlineAuthCode` is the agent-issued work code the batch was
   * captured under. A valid code stamps every op with offlineAuthId for
   * traceability; an invalid/expired/missing code buffers the ops as CONFLICT
   * (`INVALID_OFFLINE_AUTH`) — reviewable, never dropped.
   */
  static async ingest(tenantId: string, ops: IncomingOp[], offlineAuthCode?: string) {
    const results: Array<{ opKey: string; id: string; duplicate: boolean; state?: string }> = [];

    // Resolve the work code once per batch.
    let offlineAuthId: string | null = null;
    let authRejection: string | null = null;
    if (offlineAuthCode) {
      const { OfflineAuthService } = await import("./offline-auth.service");
      const verdict = await OfflineAuthService.verifyCode(tenantId, offlineAuthCode);
      if (verdict.ok) {
        offlineAuthId = verdict.auth.id;
        // Enforce maxOperations across the incoming batch, not just per-call.
        if (verdict.auth.maxOperations != null) {
          const used = await prisma.syncOperation.count({ where: { offlineAuthId } });
          if (used + ops.length > verdict.auth.maxOperations) {
            authRejection = "INVALID_OFFLINE_AUTH:EXHAUSTED";
            offlineAuthId = null;
          }
        }
      } else {
        authRejection = `INVALID_OFFLINE_AUTH:${verdict.reason}`;
      }
    } else {
      authRejection = "INVALID_OFFLINE_AUTH:MISSING_CODE";
    }

    for (const op of ops) {
      const existing = await prisma.syncOperation.findUnique({
        where: { tenantId_opKey: { tenantId, opKey: op.opKey } },
        select: { id: true },
      });
      if (existing) {
        results.push({ opKey: op.opKey, id: existing.id, duplicate: true });
        continue;
      }
      const created = await prisma.syncOperation.create({
        data: {
          tenantId,
          clientUuid: op.clientUuid,
          opKey: op.opKey,
          entityType: op.entityType,
          payload: op.payload as object,
          deviceId: op.deviceId ?? null,
          capturedAt: new Date(op.capturedAt),
          offlineAuthId,
          state: authRejection ? "CONFLICT" : "PENDING",
          conflictReason: authRejection,
        },
        select: { id: true, state: true },
      });
      results.push({ opKey: op.opKey, id: created.id, duplicate: false, state: created.state });
    }

    return results;
  }

  /**
   * Reconcile a single buffered operation through the pipeline. Idempotent:
   * a non-PENDING op is a no-op. Returns the terminal state.
   */
  static async reconcile(operationId: string): Promise<{ state: string; reason?: string }> {
    const op = await prisma.syncOperation.findUnique({ where: { id: operationId } });
    if (!op) return { state: "MISSING" };
    if (op.state !== "PENDING") return { state: op.state }; // idempotency drop

    if (op.payload == null || typeof op.payload !== "object") {
      return this.finalise(operationId, "CONFLICT", "Malformed or empty payload");
    }

    // Dispatch authoritative re-validation by entity type. Each returns a
    // terminal state; a CONFLICT is never silently dropped — it surfaces for
    // review. A RETRY outcome (transient canonical failure BEFORE acceptance)
    // leaves the op PENDING so the next reconcile pass retries it (F5.5).
    let outcome: { state: "SYNCED" | "CONFLICT" | "RETRY"; reason?: string };
    switch (op.entityType) {
      case "Claim":
        outcome = await this.reconcileClaim(
          { id: op.id, tenantId: op.tenantId, clientUuid: op.clientUuid, opKey: op.opKey, deviceId: op.deviceId, offlineAuthId: op.offlineAuthId },
          op.payload as Record<string, unknown>,
        );
        break;
      default:
        outcome = { state: "SYNCED" };
    }
    if (outcome.state === "RETRY") return { state: "PENDING", reason: outcome.reason };
    return this.finalise(operationId, outcome.state, outcome.reason);
  }

  /**
   * Authoritative re-validation + creation for an offline-captured claim. The
   * provisional decision was made against a cached snapshot; on reconnect we
   * re-validate against live state and, when clean, create the Claim (source
   * OFFLINE_SYNC, status RECEIVED) for adjudication. Any failure resolves to
   * CONFLICT with a reason — surfaced for review, never silently dropped.
   *
   * Idempotent: reuses the operation's clientUuid as the claim's external ref
   * so a re-run does not create a duplicate.
   */
  private static async reconcileClaim(
    op: { id: string; tenantId: string; clientUuid: string; opKey: string; deviceId: string | null; offlineAuthId: string | null },
    payload: Record<string, unknown>,
  ): Promise<{ state: "SYNCED" | "CONFLICT" | "RETRY"; reason?: string }> {
    const { tenantId, clientUuid } = op;
    const memberNumber = payload.memberNumber as string | undefined;
    const providerCode = payload.providerCode as string | undefined;
    const serviceType = payload.serviceType as string | undefined;
    const lineItems = (payload.lineItems as Array<{ description: string; quantity: number; unitCost: number; serviceCategory?: string; cptCode?: string }>) ?? [];
    if (!memberNumber) return { state: "CONFLICT", reason: "Missing memberNumber" };
    if (!serviceType) return { state: "CONFLICT", reason: "Missing serviceType" };
    if (lineItems.length === 0) return { state: "CONFLICT", reason: "No line items" };

    // PR-036: the work code IS the provider identity — the pack was issued to
    // one facility, so the op resolves to that provider authoritatively. The
    // free-text provider code is only a fallback for API-path ops without a
    // work code (matched by Slade360 id, then case-insensitive name).
    let providerId: string | null = null;
    if (op.offlineAuthId) {
      const auth = await prisma.offlineWorkAuthorization.findUnique({
        where: { id: op.offlineAuthId },
        select: { provider: { select: { id: true } } },
      });
      providerId = auth?.provider?.id ?? null;
    }
    if (!providerId && providerCode) {
      const byCode = await prisma.provider.findFirst({
        where: {
          tenantId,
          OR: [
            { slade360ProviderId: providerCode },
            { name: { equals: providerCode, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      providerId = byCode?.id ?? null;
    }
    if (!providerId) return { state: "CONFLICT", reason: "Provider not resolvable at sync time (no work-code facility, no Slade360/name match)" };

    // Idempotency across the migration boundary: a claim already created for
    // this offline op (legacy externalRef path OR canonical) links + syncs.
    const existing = await prisma.claim.findFirst({
      where: { tenantId, externalRef: clientUuid },
      select: { id: true },
    });
    if (existing) {
      await prisma.syncOperation.update({ where: { id: op.id }, data: { resultClaimId: existing.id } }).catch(() => undefined);
      return { state: "SYNCED" };
    }

    const billed = lineItems.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    // Offline-reservation re-validation (spec §4 / F5.5): the provisional
    // offline promise was made against a cached balance; if the LIVE canonical
    // benefit service can no longer honour it, that is a reconciliation
    // CONFLICT for review (the pack over-committed) — distinct from ordinary
    // business gates, which now become routed claims (D6) below.
    const member = await prisma.member.findFirst({ where: { tenantId, memberNumber }, select: { id: true } });
    if (member) {
      const availability = await BenefitUsageService.computeAvailability(prisma, {
        memberId: member.id,
        benefitCategory: "OUTPATIENT",
        requestedAmount: billed,
        serviceDate: payload.dateOfService ? new Date(payload.dateOfService as string) : undefined,
      });
      if (availability && billed > availability.payableCeiling + 0.01) {
        const b = availability.binding!;
        return {
          state: "CONFLICT",
          reason:
            `[${availability.reasonCode}] Insufficient benefit at sync time: ${b.label} has ` +
            `${Math.floor(b.available)} available vs billed ${billed}`,
        };
      }
    }

    // Canonical intake (F5.5): opKey is the durable idempotency key; the
    // clientUuid rides as the external ref for cross-boundary continuity.
    // Member/eligibility problems are ACCEPTED-AND-ROUTED claims (D6) — the
    // business exception stays visible on the claim, never a lost op. Only
    // structural/scope failures (member not in the pack's entitlement, bad
    // codes/amounts) resolve to CONFLICT for review.
    const diagnoses = ((payload.diagnoses as string[]) ?? [])
      .filter((d) => typeof d === "string" && d.trim().length > 0)
      .map((code, i) => ({ code: code.trim(), isPrimary: i === 0 }));
    const submission = {
      schemaVersion: "1" as const,
      idempotencyKey: op.opKey,
      externalClaimRef: clientUuid,
      member: { memberNumber },
      provider: { providerId },
      encounter: {
        serviceType: serviceType as never,
        benefitCategory: "OUTPATIENT" as const,
        serviceFrom: payload.dateOfService
          ? new Date(payload.dateOfService as string).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      },
      diagnoses,
      lines: lineItems.map((l) => ({
        serviceCategory: (l.serviceCategory ?? "OTHER") as never,
        ...(l.cptCode ? { cptCode: l.cptCode } : {}),
        description: l.description,
        quantity: l.quantity,
        unitCost: l.unitCost,
        billedAmount: Math.round(l.quantity * l.unitCost * 100) / 100,
      })),
    };

    try {
      const result = await ClaimIntakeService.submit(
        { kind: "offlineDevice", tenantId, providerId, deviceId: op.deviceId ?? "unknown" },
        submission,
      );
      // Link the op to its receipt + result claim BEFORE marking SYNCED, so a
      // crash between the two never yields a SYNCED-but-unlinked op.
      await prisma.syncOperation.update({
        where: { id: op.id },
        data: { receiptId: result.receiptId, resultClaimId: result.claimId },
      });
      if (result.outcome === "ACCEPTED" && result.claimId) {
        await processAcceptedRunInline(result.claimId);
      }
      return { state: "SYNCED" };
    } catch (err) {
      const e = IntakeError.from(err);
      // Transient failure BEFORE acceptance: keep the op PENDING — the next
      // reconcile pass retries with the same opKey (never double-applies).
      if (e.kind === "RETRYABLE") return { state: "RETRY", reason: e.message };
      const detail = e.issues?.length ? e.issues.map((i) => i.message).join("; ") : e.message;
      return { state: "CONFLICT", reason: detail };
    }
  }

  private static async finalise(
    operationId: string,
    state: "SYNCED" | "CONFLICT",
    reason?: string,
  ): Promise<{ state: string; reason?: string }> {
    const op = await prisma.syncOperation.update({
      where: { id: operationId },
      data: {
        state,
        syncedAt: state === "SYNCED" ? new Date() : null,
        conflictReason: state === "CONFLICT" ? (reason ?? "Conflict") : null,
      },
      select: { tenantId: true, opKey: true, entityType: true },
    });

    // PR-036: a CONFLICT op must be VISIBLE to operations, not just a row in
    // SyncOperation — it lands in the Exception Register for supervisor
    // review ("flagged for review — never lost" made true).
    if (state === "CONFLICT") {
      const actorId = await getSystemActorId(op.tenantId).catch(() => null);
      if (actorId) {
        await prisma.exceptionLog
          .create({
            data: {
              tenantId: op.tenantId,
              entityType: "CLAIM",
              entityId: operationId,
              entityRef: `SYNC ${op.opKey}`,
              exceptionCode: "OTHER",
              reason: `Offline ${op.entityType} op failed re-validation at sync: ${reason ?? "conflict"}. Correct the capture and resync, or action it manually.`,
              raisedById: actorId,
            },
          })
          .catch(() => undefined); // registry write must never mask the sync outcome
      }
    }
    return { state, reason };
  }
}
