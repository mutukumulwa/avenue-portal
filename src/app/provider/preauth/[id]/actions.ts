"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";

// A provider may cancel its own PA only BEFORE use (provider.preauth.cancel spec).
// Once a PA is ATTACHED/UTILISED/CONVERTED (in use on a claim) or already terminal,
// it is not provider-cancellable. cancelPreAuth also backstops terminal states.
export const PROVIDER_CANCELLABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"];

export async function cancelProviderPreauthAction(
  input: { preAuthId: string; reason: string },
): Promise<{ error?: string } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.cancel")) {
    return { error: "You do not have permission to cancel pre-authorizations." };
  }

  const preAuthId = (input.preAuthId ?? "").trim();
  if (!preAuthId) return { error: "Missing pre-authorization." };

  // Ownership + existence via the F3.10 non-enumerating scoped read: a PA that is
  // not this facility's resolves to null ⇒ safe not-found (no cross-provider probe).
  const pa = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, preAuthId);
  if (!pa) return { error: "Pre-authorization not found." };
  if (!PROVIDER_CANCELLABLE_STATUSES.includes(pa.status)) {
    return { error: `A ${pa.status.replace(/_/g, " ")} pre-authorization can no longer be cancelled.` };
  }

  try {
    // Canonical cancel (PR-011 #3: releases the benefit hold in the same operation,
    // sets CANCELLED, appends the hash-chained audit). Not a bespoke transition.
    await preauthAdjudicationService.cancelPreAuth(preAuthId, ctx.tenantId, ctx.actorId, (input.reason ?? "").trim() || "Cancelled by provider");
  } catch (e) {
    return { error: (e as Error).message || "The pre-authorization could not be cancelled." };
  }

  revalidatePath(`/provider/preauth/${preAuthId}`);
}
