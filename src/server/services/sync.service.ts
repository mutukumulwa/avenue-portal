import { prisma } from "@/lib/prisma";

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
   */
  static async ingest(tenantId: string, ops: IncomingOp[]) {
    const results: Array<{ opKey: string; id: string; duplicate: boolean }> = [];

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
          state: "PENDING",
        },
        select: { id: true },
      });
      results.push({ opKey: op.opKey, id: created.id, duplicate: false });
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
        outcome = await this.reconcileClaim(op.tenantId, op.payload as Record<string, unknown>, op.clientUuid);
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
  ): Promise<{ state: "SYNCED" | "CONFLICT"; reason?: string }> {
    const memberNumber = payload.memberNumber as string | undefined;
    const providerCode = payload.providerCode as string | undefined;
    const serviceType = payload.serviceType as string | undefined;
    const lineItems = (payload.lineItems as Array<{ description: string; quantity: number; unitCost: number; serviceCategory?: string; cptCode?: string }>) ?? [];
    if (!memberNumber) return { state: "CONFLICT", reason: "Missing memberNumber" };
    if (!providerCode) return { state: "CONFLICT", reason: "Missing providerCode" };
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

    const provider = await prisma.provider.findFirst({
      where: { tenantId, slade360ProviderId: providerCode },
      select: { id: true, contractStatus: true },
    });
    if (!provider) return { state: "CONFLICT", reason: "Provider not found at sync time" };
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
    const count = await prisma.claim.count({ where: { tenantId } });
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    await prisma.claim.create({
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
    return { state: "SYNCED" };
  }

  private static async finalise(
    operationId: string,
    state: "SYNCED" | "CONFLICT",
    reason?: string,
  ): Promise<{ state: string; reason?: string }> {
    await prisma.syncOperation.update({
      where: { id: operationId },
      data: {
        state,
        syncedAt: state === "SYNCED" ? new Date() : null,
        conflictReason: state === "CONFLICT" ? (reason ?? "Conflict") : null,
      },
    });
    return { state, reason };
  }
}
