import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";
import {
  OFFLINE_ALLOWED_ENTITY_TYPES,
  SyncService,
  isOfflineAllowedEntityType,
} from "@/server/services/sync.service";
import { enqueueSyncReconcile } from "@/lib/queue";

/**
 * POST /api/v1/sync  (Medvex spec §4 / gap G4)
 *
 * Store-and-forward ingest from an offline provider device. Body:
 *   { deviceId?, operations: [{ clientUuid, opKey, entityType, payload, capturedAt }] }
 *
 * Idempotent by opKey — safe to retry. Each accepted operation is buffered and
 * a reconcile job is enqueued. Returns per-op outcome so the client can mark
 * its local records synced.
 */
/**
 * One operation as it arrives on the wire. This is the *unvalidated* shape —
 * the guard loop below checks clientUuid/opKey/entityType/capturedAt are present
 * before any of these reach SyncService.
 */
type IncomingSyncOperation = {
  clientUuid: string;
  opKey: string;
  entityType: string;
  payload: unknown;
  deviceId?: string;
  capturedAt: string;
};

async function postSync(req: Request) {
  try {
    const body = await req.json();
    const operations = body?.operations;
    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ error: "operations[] is required" }, { status: 400 });
    }
    for (const op of operations) {
      // UAT-HF P04.04 / DEC-08: reject an entity type outside the allowlist AT
      // THE DOOR. Buffering it and then acknowledging it is how DEF-067 lost
      // data — the device deletes its copy on a "synced" it never earned.
      if (op?.entityType && !isOfflineAllowedEntityType(String(op.entityType))) {
        return NextResponse.json(
          {
            error: `Entity type "${op.entityType}" cannot be captured offline. Nothing was stored.`,
            allowed: OFFLINE_ALLOWED_ENTITY_TYPES,
          },
          { status: 400 },
        );
      }
      if (!op?.clientUuid || !op?.opKey || !op?.entityType || !op?.capturedAt) {
        return NextResponse.json(
          { error: "each operation needs clientUuid, opKey, entityType, capturedAt" },
          { status: 400 },
        );
      }
    }

    // ELIG-GAP (Phase 6): confine the sync ingest to the KEY's own tenant — never
    // `tenant.findFirst()`, which let ANY valid key write into the first tenant.
    // A per-facility key uses its bound tenant; only an unbound operator key falls
    // back to the single-operator scaffold.
    const credential = await getApiCredential(req);
    if (!credential) return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    const tenantId = credential.tenantId ?? (await prisma.tenant.findFirst({ select: { id: true } }))?.id;
    if (!tenantId) return NextResponse.json({ error: "No operator tenant" }, { status: 500 });

    const results = await SyncService.ingest(
      tenantId,
      operations.map((o: IncomingSyncOperation) => ({
        clientUuid: o.clientUuid,
        opKey: o.opKey,
        entityType: o.entityType,
        payload: o.payload,
        deviceId: o.deviceId ?? body.deviceId,
        capturedAt: o.capturedAt,
      })),
      // WP-B4: the agent-issued offline work code the batch was captured
      // under. Missing/invalid ⇒ ops buffer as reviewable CONFLICTs.
      body.offlineAuthCode,
    );

    // Enqueue reconcile for freshly-buffered (non-duplicate) operations.
    await Promise.all(
      results.filter((r) => !r.duplicate).map((r) => enqueueSyncReconcile(r.id)),
    );

    return NextResponse.json({ accepted: results.length, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync ingest failed" },
      { status: 500 },
    );
  }
}

export const POST = withApiKey(postSync);
