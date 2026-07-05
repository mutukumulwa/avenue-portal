"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { SyncService, type IncomingOp } from "@/server/services/sync.service";
import { enqueueSyncReconcile } from "@/lib/queue";

/**
 * Session-authed ingest for the in-app offline-capture tool (G4 Phase-1). The
 * external provider-device path uses POST /api/v1/sync (API key); this action
 * serves the in-app demo/ops flow. Idempotent (by opKey); enqueues reconcile
 * for freshly-buffered ops.
 */
export async function ingestOfflineOpsAction(
  ops: IncomingOp[],
  offlineAuthCode?: string,
): Promise<{
  accepted: number;
  syncedOpKeys: string[];
  conflicts: number;
  /** PR-036: per-op TERMINAL state — the client shows the truth, never "synced" for a conflicted op. */
  outcomes: Array<{ opKey: string; state: string; reason?: string }>;
}> {
  const session = await requireRole(ROLES.OPS);
  if (!Array.isArray(ops) || ops.length === 0) return { accepted: 0, syncedOpKeys: [], conflicts: 0, outcomes: [] };

  // WP-B4: the work code travels with the batch; invalid/missing ⇒ ops buffer
  // as reviewable CONFLICTs server-side (never dropped).
  const results = await SyncService.ingest(session.user.tenantId, ops, offlineAuthCode);

  // PR-036: reconcile the in-app batch SYNCHRONOUSLY so the operator gets the
  // terminal verdict (claim created vs conflict + reason) in the same click.
  // The provider-device API path (/api/v1/sync) keeps the worker queue.
  const outcomes: Array<{ opKey: string; state: string; reason?: string }> = [];
  for (const r of results) {
    if (!r.duplicate && r.state === "PENDING") {
      const { state, reason } = await SyncService.reconcile(r.id);
      outcomes.push({ opKey: r.opKey, state, reason });
    } else if (r.state === "CONFLICT") {
      // Buffered as conflict at ingest (bad/missing work code) — still enqueue
      // nothing; it is already terminal and registered.
      outcomes.push({ opKey: r.opKey, state: "CONFLICT", reason: "Work code invalid/expired at ingest" });
    } else {
      outcomes.push({ opKey: r.opKey, state: r.state ?? "SYNCED" });
    }
  }
  void enqueueSyncReconcile; // API-path helper retained

  return {
    accepted: results.length,
    syncedOpKeys: outcomes.filter((o) => o.state === "SYNCED").map((o) => o.opKey),
    conflicts: outcomes.filter((o) => o.state === "CONFLICT").length,
    outcomes,
  };
}

/**
 * Verify an offline work code and hand back the facility's ENCRYPTED data
 * pack (WP-B4). The plaintext never leaves the server unencrypted — the
 * capture client decrypts in the browser with the code the operator typed.
 */
export async function unlockOfflineWorkAction(code: string): Promise<
  | { ok: true; pack: { packId: string; generatedAt: string; validUntil: string; memberCount: number; keyVersion: number; ciphertext: string; iv: string; authTag: string } }
  | { ok: false; reason: string }
> {
  const session = await requireRole(ROLES.OPS);
  try {
    const { OfflinePackService } = await import("@/server/services/offline-pack.service");
    const pack = await OfflinePackService.getEncryptedPack(session.user.tenantId, code);
    return { ok: true, pack };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Verification failed" };
  }
}
