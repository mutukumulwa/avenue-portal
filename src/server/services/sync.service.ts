import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { FraudService } from "./fraud.service";
import { AutoAdjudicationService } from "./auto-adjudication.service";
import { getSystemActorId } from "./system-actor.service";
import { BenefitUsageService } from "./benefit-usage.service";

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
    // review. (Phase-1: Claim re-validation live; other entities pass-through.)
    let outcome: { state: "SYNCED" | "CONFLICT"; reason?: string };
    switch (op.entityType) {
      case "Claim":
        outcome = await this.reconcileClaim(op.tenantId, op.payload as Record<string, unknown>, op.clientUuid, op.offlineAuthId);
        break;
      default:
        outcome = { state: "SYNCED" };
    }
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
    tenantId: string,
    payload: Record<string, unknown>,
    clientUuid: string,
    offlineAuthId?: string | null,
  ): Promise<{ state: "SYNCED" | "CONFLICT"; reason?: string }> {
    const memberNumber = payload.memberNumber as string | undefined;
    const providerCode = payload.providerCode as string | undefined;
    const serviceType = payload.serviceType as string | undefined;
    const lineItems = (payload.lineItems as Array<{ description: string; quantity: number; unitCost: number; serviceCategory?: string; cptCode?: string }>) ?? [];
    if (!memberNumber) return { state: "CONFLICT", reason: "Missing memberNumber" };
    if (!serviceType) return { state: "CONFLICT", reason: "Missing serviceType" };
    if (lineItems.length === 0) return { state: "CONFLICT", reason: "No line items" };

    const member = await prisma.member.findFirst({
      where: { tenantId, memberNumber },
      select: { id: true, status: true, group: { select: { status: true } } },
    });
    if (!member) return { state: "CONFLICT", reason: "Member not found at sync time" };
    if (member.status !== "ACTIVE") return { state: "CONFLICT", reason: `Membership ${member.status} at sync time` };
    if (["SUSPENDED", "LAPSED", "TERMINATED"].includes(member.group.status)) {
      return { state: "CONFLICT", reason: `Scheme ${member.group.status} at sync time` };
    }

    // PR-036: the work code IS the provider identity — the pack was issued to
    // one facility, so the op resolves to that provider authoritatively. The
    // free-text provider code is only a fallback for API-path ops without a
    // work code (matched by Slade360 id, then case-insensitive name).
    let provider: { id: string; contractStatus: string } | null = null;
    if (offlineAuthId) {
      const auth = await prisma.offlineWorkAuthorization.findUnique({
        where: { id: offlineAuthId },
        select: { provider: { select: { id: true, contractStatus: true } } },
      });
      provider = auth?.provider ?? null;
    }
    if (!provider && providerCode) {
      provider = await prisma.provider.findFirst({
        where: {
          tenantId,
          OR: [
            { slade360ProviderId: providerCode },
            { name: { equals: providerCode, mode: "insensitive" } },
          ],
        },
        select: { id: true, contractStatus: true },
      });
    }
    if (!provider) return { state: "CONFLICT", reason: "Provider not resolvable at sync time (no work-code facility, no Slade360/name match)" };
    if (["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      return { state: "CONFLICT", reason: `Provider contract ${provider.contractStatus}` };
    }

    // Idempotency: if a claim already exists for this offline op, do not recreate.
    const existing = await prisma.claim.findFirst({
      where: { tenantId, externalRef: clientUuid },
      select: { id: true },
    });
    if (existing) return { state: "SYNCED" };

    const billed = lineItems.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    // Benefit-balance re-validation (spec §4): the provisional decision was made
    // against a cached balance. P1.5 (gap #6): the check resolves the SUBMITTED
    // claim's category through BenefitUsageService instead of summing
    // availability across every category (which let an outpatient claim "fit"
    // inside dental+optical+inpatient headroom). The offline rail files
    // OUTPATIENT claims; full constraint enforcement (pools/overall) re-runs at
    // adjudication via the P1.3 gate. FG-C10 hold-expiry reconciliation and the
    // converting-hold credit are inside computeAvailability.
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
    const claimNumber = await peekNextDocumentNumber("CLM", (yp) =>
      prisma.claim
        .findFirst({ where: { tenantId, claimNumber: { startsWith: yp } }, orderBy: { claimNumber: "desc" }, select: { claimNumber: true } })
        .then((r) => r?.claimNumber ?? null),
    );

    const created = await prisma.claim.create({
      data: {
        tenantId,
        claimNumber,
        externalRef: clientUuid,
        memberId: member.id,
        providerId: provider.id,
        source: "OFFLINE_SYNC",
        serviceType: serviceType as never,
        dateOfService: payload.dateOfService ? new Date(payload.dateOfService as string) : new Date(),
        diagnoses: (payload.diagnoses as string[]) ?? [],
        procedures: [],
        billedAmount: billed,
        approvedAmount: 0,
        copayAmount: 0,
        status: "RECEIVED",
        benefitCategory: "OUTPATIENT",
        claimLines: {
          create: lineItems.map((l, i) => ({
            lineNumber: i + 1,
            description: l.description,
            quantity: l.quantity,
            unitCost: l.unitCost,
            billedAmount: l.quantity * l.unitCost,
            approvedAmount: 0,
            serviceCategory: (l.serviceCategory as never) ?? ("OTHER" as never),
            cptCode: l.cptCode ?? null,
          })),
        },
      },
    });

    // Intake pipeline (G3.7/G9.5): fraud signals, drug exclusions, then
    // auto-adjudication under the system actor. processIntake never throws —
    // any pipeline failure routes the claim to manual review.
    const systemActorId = await getSystemActorId(tenantId);
    await FraudService.evaluateClaim(created.id, tenantId).catch(() => undefined);
    await AutoAdjudicationService.processIntake(tenantId, created.id, systemActorId);

    return { state: "SYNCED" };
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
