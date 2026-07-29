"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { PreauthInfoRequestService } from "@/server/services/preauth-info-request/service";

/**
 * F4.4 — reviewer (payer-side) decisions on a submitted clinical information
 * response: accept (sanctions claim reprocessing, F4.5), reopen (back to the
 * provider), close (terminal). Gated on the CLINICAL review role (ASSUMPTION —
 * no dedicated reviewer permission exists; flagged). Each writes a compliance
 * audit (the service appends the PA event; writeAudit is the tamper-evident trail).
 */

export async function acceptInfoRequestAction(input: { infoRequestId: string; note?: string }): Promise<{ error?: string } | void> {
  const session = await requireRole(ROLES.CLINICAL);
  const id = (input.infoRequestId ?? "").trim();
  if (!id) return { error: "Missing information request." };
  let preauthId: string;
  try {
    const r = await PreauthInfoRequestService.accept({ tenantId: session.user.tenantId, id, actor: { type: "USER", id: session.user.id }, note: input.note });
    preauthId = r.preAuthorizationId;
    await writeAudit({ userId: session.user.id, action: "PREAUTH_INFO_ACCEPTED", module: "PREAUTH", description: `Information request ${id.slice(0, 8)} accepted on PA ${preauthId.slice(0, 8)}`, metadata: { infoRequestId: id, preauthId } });
  } catch (e) {
    return { error: (e as Error).message || "The information request could not be accepted." };
  }
  revalidatePath(`/preauth/${preauthId}`);
}

export async function reopenInfoRequestAction(input: { infoRequestId: string; note?: string }): Promise<{ error?: string } | void> {
  const session = await requireRole(ROLES.CLINICAL);
  const id = (input.infoRequestId ?? "").trim();
  if (!id) return { error: "Missing information request." };
  let preauthId: string;
  try {
    const r = await PreauthInfoRequestService.reopen({ tenantId: session.user.tenantId, id, actor: { type: "USER", id: session.user.id }, note: input.note });
    preauthId = r.preAuthorizationId;
    await writeAudit({ userId: session.user.id, action: "PREAUTH_INFO_REOPENED", module: "PREAUTH", description: `Information request ${id.slice(0, 8)} reopened on PA ${preauthId.slice(0, 8)}`, metadata: { infoRequestId: id, preauthId } });
  } catch (e) {
    return { error: (e as Error).message || "The information request could not be reopened." };
  }
  revalidatePath(`/preauth/${preauthId}`);
}

export async function closeInfoRequestAction(input: { infoRequestId: string; note?: string }): Promise<{ error?: string } | void> {
  const session = await requireRole(ROLES.CLINICAL);
  const id = (input.infoRequestId ?? "").trim();
  if (!id) return { error: "Missing information request." };
  let preauthId: string;
  try {
    const r = await PreauthInfoRequestService.close({ tenantId: session.user.tenantId, id, actor: { type: "USER", id: session.user.id }, note: input.note });
    preauthId = r.preAuthorizationId;
    await writeAudit({ userId: session.user.id, action: "PREAUTH_INFO_CLOSED", module: "PREAUTH", description: `Information request ${id.slice(0, 8)} closed on PA ${preauthId.slice(0, 8)}`, metadata: { infoRequestId: id, preauthId } });
  } catch (e) {
    return { error: (e as Error).message || "The information request could not be closed." };
  }
  revalidatePath(`/preauth/${preauthId}`);
}
