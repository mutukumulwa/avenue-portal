"use server";

import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createReprocessRun } from "@/server/services/claim-intake/processing";
import { processAcceptedRunInline } from "@/server/services/claim-intake";
import { auditChainService } from "@/server/services/audit-chain.service";

/**
 * F6.3: authorized reprocess — creates a NEW processing run (next sequence,
 * revision-guarded; old stage history is never edited) and processes it
 * in-request. Idempotent: an existing non-terminal run is reused, never doubled.
 */
export async function reprocessClaimAction(claimId: string, trigger: "MANUAL_REPROCESS" | "DUPLICATE_CLEARED" | "DOCUMENTS_UPDATED") {
  const session = await requireRole(ROLES.CLINICAL);
  const tenantId = session.user.tenantId;

  const claim = await prisma.claim.findFirst({
    where: { id: claimId, tenantId },
    select: { id: true, claimRevision: true, status: true, intakeReceipts: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
  });
  if (!claim) return { ok: false as const, error: "Claim not found." };
  if (["APPROVED", "PARTIALLY_APPROVED", "DECLINED", "VOID", "SETTLED", "PAID"].includes(claim.status)) {
    return { ok: false as const, error: `The claim is already ${claim.status.replace(/_/g, " ")} — reprocessing applies only before a decision.` };
  }
  const receiptId = claim.intakeReceipts[0]?.id;
  if (!receiptId) return { ok: false as const, error: "This claim predates the canonical intake (no receipt) — decide it manually." };

  const run = await createReprocessRun(prisma, {
    tenantId,
    claimId,
    receiptId,
    claimRevision: claim.claimRevision,
    trigger,
  });

  await auditChainService
    .append({
      actorId: session.user.id,
      action: "CLAIM:REPROCESS_REQUESTED",
      module: "CLAIMS",
      entityType: "Claim",
      entityId: claimId,
      payload: { runId: run.runId, sequence: run.sequence, trigger, created: run.created },
      tenantId,
      description: `Reprocess (${trigger}) requested — run seq ${run.sequence}${run.created ? "" : " (existing run reused)"}`,
    })
    .catch(() => undefined);

  await processAcceptedRunInline(claimId);
  revalidatePath(`/claims/${claimId}`);
  return { ok: true as const, runId: run.runId, reused: !run.created };
}
