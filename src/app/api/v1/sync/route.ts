import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/apiAuth";
import { SyncService } from "@/server/services/sync.service";
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
async function postSync(req: Request) {
  try {
    const body = await req.json();
    const operations = body?.operations;
    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ error: "operations[] is required" }, { status: 400 });
    }
    for (const op of operations) {
      if (!op?.clientUuid || !op?.opKey || !op?.entityType || !op?.capturedAt) {
        return NextResponse.json(
          { error: "each operation needs clientUuid, opKey, entityType, capturedAt" },
          { status: 400 },
        );
      }
    }

    // TODO(G8): map the API key → operator tenant. Single-operator scaffold
    // resolves the sole tenant.
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "No operator tenant" }, { status: 500 });

    const results = await SyncService.ingest(
      tenant.id,
      operations.map((o: any) => ({
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
