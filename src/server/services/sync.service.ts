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
  static async reconcile(operationId: string): Promise<{ state: string }> {
    const op = await prisma.syncOperation.findUnique({ where: { id: operationId } });
    if (!op) return { state: "MISSING" };
    if (op.state !== "PENDING") return { state: op.state }; // idempotency drop

    // Steps 2-4 (scaffold): entity-specific re-validation / conflict / adjudication.
    // Phase-1 fills these in per entityType; today we validate structural presence
    // and pass through to SYNCED, flagging obviously-incomplete payloads for review.
    const payloadOk = op.payload != null && typeof op.payload === "object";
    const nextState: "SYNCED" | "CONFLICT" = payloadOk ? "SYNCED" : "CONFLICT";

    await prisma.syncOperation.update({
      where: { id: operationId },
      data: {
        state: nextState,
        syncedAt: nextState === "SYNCED" ? new Date() : null,
        conflictReason: nextState === "CONFLICT" ? "Malformed or empty payload" : null,
      },
    });

    // Step 5 (scaffold): audit-chain delta entry lands with the entity wiring.
    return { state: nextState };
  }
}
