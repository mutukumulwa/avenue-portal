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
): Promise<{ accepted: number; syncedOpKeys: string[] }> {
  const session = await requireRole(ROLES.OPS);
  if (!Array.isArray(ops) || ops.length === 0) return { accepted: 0, syncedOpKeys: [] };

  const results = await SyncService.ingest(session.user.tenantId, ops);
  await Promise.all(results.filter((r) => !r.duplicate).map((r) => enqueueSyncReconcile(r.id)));
  return { accepted: results.length, syncedOpKeys: results.map((r) => r.opKey) };
}
