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
): Promise<{ accepted: number; syncedOpKeys: string[]; conflicts: number }> {
  const session = await requireRole(ROLES.OPS);
  if (!Array.isArray(ops) || ops.length === 0) return { accepted: 0, syncedOpKeys: [], conflicts: 0 };

  // WP-B4: the work code travels with the batch; invalid/missing ⇒ ops buffer
  // as reviewable CONFLICTs server-side (never dropped).
  const results = await SyncService.ingest(session.user.tenantId, ops, offlineAuthCode);
  await Promise.all(
    results.filter((r) => !r.duplicate && r.state === "PENDING").map((r) => enqueueSyncReconcile(r.id)),
  );
  return {
    accepted: results.length,
    syncedOpKeys: results.map((r) => r.opKey),
    conflicts: results.filter((r) => r.state === "CONFLICT").length,
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
