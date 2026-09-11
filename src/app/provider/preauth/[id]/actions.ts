"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isProviderAccessError, ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { ClaimsService } from "@/server/services/claims.service";
import { writeAudit } from "@/lib/audit";
import { mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { operatingTodayISO } from "@/lib/service-date";
import type { PreauthAmendmentCaptureSubmission } from "@/lib/provider-capture-contract";
import { TRPCError } from "@trpc/server";
import { ProviderClaimCaptureService } from "@/server/services/provider-claim-capture.service";
import { amendmentProcedures, clinicalNotesOf } from "@/server/services/provider-preauth-capture.service";
import { PROVIDER_CANCELLABLE_STATUSES } from "./constants";

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

// A mid-treatment amendment requests ADDITIONAL cost/procedures against an already
// APPROVED PA. There is no dedicated provider.preauth.amend permission — an amendment
// is a linked follow-up REQUEST, so it is gated on provider.preauth.create (ASSUMPTION,
// flagged; a dedicated amend permission could be added if the plan intends one).
//
// Family Hospital UAT plan P04.03: the additional services are captured like a new
// request — from the facility's price list, re-read here for the parent's member,
// date and benefit (fixed by the SERVER from the parent, never from the form), with
// each estimate parsed as a decimal. They are stored in the pre-auth intake's own
// procedure shape with server-built provenance; the additional cost is decimal text.
export async function amendProviderPreauthAction(input: PreauthAmendmentCaptureSubmission): Promise<MutationFailure | void> {
  let access;
  try {
    access = await ProviderAccessService.resolveUserContext();
  } catch (err) {
    if (isProviderAccessError(err)) return mutationFail("FORBIDDEN", { message: "You do not have permission to amend pre-authorisations." });
    throw err;
  }
  const { ctx } = access;
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) {
    return mutationFail("FORBIDDEN", { message: "You do not have permission to amend pre-authorisations." });
  }

  const parentId = typeof input?.parentPreAuthId === "string" ? input.parentPreAuthId.trim() : "";
  if (!parentId) return mutationFail("VALIDATION", { message: "Missing pre-authorisation." });

  // Ownership + state via the F3.10 scoped read: the parent must be this facility's AND
  // APPROVED (createPaAmendment enforces APPROVED too, but this gives a friendly error
  // and blocks cross-provider amendment — the canonical method is only tenant-scoped).
  const parent = await PreauthReadService.getById({ tenantId: ctx.tenantId, providerId: ctx.providerId }, parentId);
  if (!parent) return mutationFail("VALIDATION", { message: "Pre-authorisation not found." });
  if (parent.status !== "APPROVED") return mutationFail("CONFLICT", { message: "Only an approved pre-authorisation can be amended." });

  const notes = clinicalNotesOf(input.clinicalNotes);
  if (!notes.ok) return notes.failure;
  const prep = await ProviderClaimCaptureService.prepareLines(ctx, input, {
    purpose: "PREAUTH",
    fixed: {
      memberId: parent.memberId,
      branchId: null,
      serviceDate: operatingTodayISO(parent.expectedDateOfService ?? new Date()),
      benefitCategory: parent.benefitCategory,
    },
  });
  if (!prep.ok) return prep.failure;

  let amendment: { id: string };
  try {
    // Canonical amendment creator: a new PA-AMD linked to the parent (parentPreAuthId),
    // inheriting member/provider/benefit; not a bespoke create.
    amendment = await preauthAdjudicationService.createPaAmendment(parentId, ctx.tenantId, ctx.actorId, {
      additionalCost: prep.prepared.totalBilled,
      additionalProcedures: amendmentProcedures(prep.prepared.lines),
      clinicalNotes: notes.value,
    });
  } catch (e) {
    if (e instanceof TRPCError && (e.code === "BAD_REQUEST" || e.code === "NOT_FOUND")) {
      return mutationFail("CONFLICT", { message: e.message });
    }
    return mutationFail("UNKNOWN_OUTCOME", { message: "We could not confirm whether the amendment was created. Check this pre-authorisation before trying again." });
  }

  // Decide the amendment through the SAME canonical pipeline as every rail (the
  // benefit-cap gate checks the additional cost against remaining benefit). A failure
  // leaves the amendment durable + SUBMITTED for a sweeper/human — never fail the request.
  try {
    await preauthAdjudicationService.executeAutoDecision(amendment.id, ctx.tenantId, await getSystemActorId(ctx.tenantId));
  } catch {
    /* deferred — amendment is durable and visible */
  }

  revalidatePath(`/provider/preauth/${parentId}`);
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
