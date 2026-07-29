"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { ClaimsService } from "@/server/services/claims.service";
import { writeAudit } from "@/lib/audit";

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

export interface ProviderAmendInput {
  parentPreAuthId: string;
  additionalCost: number;
  additionalProcedureCode?: string;
  additionalProcedureDescription: string;
  clinicalNotes?: string;
}

// A mid-treatment amendment requests ADDITIONAL cost/procedures against an already
// APPROVED PA. There is no dedicated provider.preauth.amend permission — an amendment
// is a linked follow-up REQUEST, so it is gated on provider.preauth.create (ASSUMPTION,
// flagged; a dedicated amend permission could be added if the plan intends one).
export async function amendProviderPreauthAction(
  input: ProviderAmendInput,
): Promise<{ error?: string } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) {
    return { error: "You do not have permission to amend pre-authorizations." };
  }

  const parentId = (input.parentPreAuthId ?? "").trim();
  if (!parentId) return { error: "Missing pre-authorization." };
  const additionalCost = Number(input.additionalCost);
  if (!(additionalCost > 0)) return { error: "Enter a valid additional cost." };
  if (!input.additionalProcedureDescription?.trim()) return { error: "Describe the additional service." };

  // Ownership + state via the F3.10 scoped read: the parent must be this facility's AND
  // APPROVED (createPaAmendment enforces APPROVED too, but this gives a friendly error
  // and blocks cross-provider amendment — the canonical method is only tenant-scoped).
  const parent = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, parentId);
  if (!parent) return { error: "Pre-authorization not found." };
  if (parent.status !== "APPROVED") return { error: "Only an approved pre-authorization can be amended." };

  let amendment: { id: string };
  try {
    // Canonical amendment creator: a new PA-AMD linked to the parent (parentPreAuthId),
    // inheriting member/provider/benefit; not a bespoke create.
    amendment = await preauthAdjudicationService.createPaAmendment(parentId, ctx.tenantId, ctx.actorId, {
      additionalCost,
      additionalProcedures: [{ code: input.additionalProcedureCode || "", description: input.additionalProcedureDescription }],
      clinicalNotes: input.clinicalNotes,
    });
  } catch (e) {
    return { error: (e as Error).message || "The amendment could not be created." };
  }

  // Decide the amendment through the SAME canonical pipeline as every rail (the
  // benefit-cap gate checks the additional cost against remaining benefit). A failure
  // leaves the amendment durable + SUBMITTED for a sweeper/human — never fail the request.
  try {
    await preauthAdjudicationService.executeAutoDecision(amendment.id, ctx.tenantId, await getSystemActorId(ctx.tenantId));
  } catch {
    /* deferred — amendment is durable and visible */
  }

  redirect(`/provider/preauth/${amendment.id}`);
}

// F3.13: start a claim from an APPROVED PA. Filing a claim ⇒ gated on
// provider.claim.create (ASSUMPTION, flagged; the page already requires
// provider.preauth.read to view the PA).
export async function fileClaimFromPreauthAction(
  input: { preAuthId: string },
): Promise<{ error?: string } | void> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.claim.create")) {
    return { error: "You do not have permission to file claims." };
  }

  const preAuthId = (input.preAuthId ?? "").trim();
  if (!preAuthId) return { error: "Missing pre-authorization." };

  // Ownership via the F3.10 scoped read (createClaimWithPreauth is only tenant-scoped).
  const pa = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, preAuthId);
  if (!pa) return { error: "Pre-authorization not found." };

  let claim: { id: string; claimNumber?: string };
  try {
    // Canonical PA→claim conversion: prefills member/provider/DOS/diagnoses + one
    // aggregate pre-authorised line at the approved amount and submits through
    // ClaimIntakeService (kind: preauthConversion). Idempotent — a converted PA
    // returns its existing claim. Enforces APPROVED. Not a bespoke claim create.
    claim = await ClaimsService.createClaimWithPreauth(ctx.tenantId, preAuthId);
  } catch (e) {
    return { error: (e as Error).message || "Could not start a claim from this pre-authorization." };
  }

  // Audit the provider-initiated attach (mirrors the admin convertToClaimAction).
  await writeAudit({
    userId: ctx.actorId,
    action: "PREAUTH_ATTACHED",
    module: "PREAUTH",
    description: `Claim ${claim.claimNumber ?? claim.id} started from pre-auth ${preAuthId.slice(0, 8)} (provider portal)`,
    metadata: { preauthId: preAuthId, claimId: claim.id },
  });

  redirect(`/provider/claims/${claim.id}`);
}
