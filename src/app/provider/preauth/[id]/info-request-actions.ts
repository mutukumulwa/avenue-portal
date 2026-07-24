"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthInfoRequestService } from "@/server/services/preauth-info-request/service";
import { writeAudit } from "@/lib/audit";

/**
 * F4.3 — the provider submits an explicit response to a clinical information
 * request. Gated on provider.preauth.respond; ownership is enforced by passing
 * ctx.providerId to the service (a request that isn't this facility's resolves to
 * a non-enumerating NOT_FOUND). The draft itself is client-side form state (F4.7).
 */
export async function submitInfoResponseAction(
  input: { infoRequestId: string; responseNote: string },
): Promise<{ error?: string } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.respond")) {
    return { error: "You do not have permission to respond to information requests." };
  }

  const infoRequestId = (input.infoRequestId ?? "").trim();
  if (!infoRequestId) return { error: "Missing information request." };
  const responseNote = (input.responseNote ?? "").trim();
  if (!responseNote) return { error: "Enter a response before submitting." };

  let preAuthorizationId: string;
  try {
    const updated = await PreauthInfoRequestService.submitResponse({
      tenantId: ctx.tenantId,
      id: infoRequestId,
      providerId: ctx.providerId, // ownership: request must belong to this facility
      responseNote,
      actor: { type: "USER", id: ctx.actorId },
    });
    preAuthorizationId = updated.preAuthorizationId;
  } catch (e) {
    return { error: (e as Error).message || "The response could not be submitted." };
  }

  // Compliance audit for the provider-initiated response (the PA event log records
  // the RESPONSE_SUBMITTED timeline entry; this is the tamper-evident audit trail).
  await writeAudit({
    userId: ctx.actorId,
    action: "PREAUTH_INFO_RESPONSE_SUBMITTED",
    module: "PREAUTH",
    description: `Provider responded to information request ${infoRequestId.slice(0, 8)} on PA ${preAuthorizationId.slice(0, 8)}`,
    metadata: { infoRequestId, preauthId: preAuthorizationId },
  });

  revalidatePath(`/provider/preauth/${preAuthorizationId}`);
}
