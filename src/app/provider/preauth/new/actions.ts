"use server";

/**
 * Family Hospital UAT plan P04.03 — the provider "Request pre-authorisation"
 * action, on the shared capture contract.
 *
 * Before: a number box read "600,000" as empty, so the estimate became 0 and the
 * request was refused (FH-10); the service and its estimate came from the global
 * CPT table's Kenyan averages labelled UGX (FH-02); a request refused once could
 * not be corrected and resent — the same draft key with new content was an
 * uncaught idempotency conflict.
 *
 * Now the case is re-resolved on the server (member, eligibility, contract,
 * currency), the diagnosis re-read, every selected tariff re-read, and each
 * estimate parsed as a decimal. The request goes through the one canonical
 * `PreauthIntakeService` on the PROVIDER_PORTAL channel with the member id the
 * server resolved and the server-built procedure provenance. Refusals come back
 * as field errors; the form renews its draft key after a refusal.
 *
 * `"use server"`: async function exports only (AGENTS.md).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import type { PreauthCaptureSubmission } from "@/lib/provider-capture-contract";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { isProviderAccessError, ProviderAccessService } from "@/server/services/provider-access.service";
import { PreauthIntakeConflict, PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { ProviderClaimCaptureService } from "@/server/services/provider-claim-capture.service";
import { clinicalNotesOf, preauthRefusal, procedureProvenance, procedureSubmissions } from "@/server/services/provider-preauth-capture.service";

export async function submitProviderPreauthAction(input: PreauthCaptureSubmission): Promise<MutationFailure | void> {
  let access;
  try {
    access = await ProviderAccessService.resolveUserContext();
  } catch (err) {
    if (isProviderAccessError(err)) return mutationFail("FORBIDDEN", { message: "You do not have permission to submit pre-authorisations." });
    throw err;
  }
  const { ctx } = access;
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) {
    return mutationFail("FORBIDDEN", { message: "You do not have permission to submit pre-authorisations." });
  }

  const notes = clinicalNotesOf(input?.clinicalNotes);
  if (!notes.ok) return notes.failure;
  const prep = await ProviderClaimCaptureService.prepare(ctx, input, { purpose: "PREAUTH" });
  if (!prep.ok) return prep.failure;
  const p = prep.prepared;

  let result;
  try {
    result = await PreauthIntakeService.submit(
      // Provider-bound channel: the facility is the session's, never the body's (D1).
      { channel: "PROVIDER_PORTAL", tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: p.trusted.branchId, actorType: "USER", actorId: ctx.actorId },
      {
        memberId: p.trusted.memberId,
        serviceType: p.serviceType,
        benefitCategory: p.trusted.benefitCategory,
        expectedDateOfService: p.trusted.serviceDateIso,
        diagnoses: [{ icdCode: p.diagnosis.code, description: p.diagnosis.description, isPrimary: true }],
        procedures: procedureSubmissions(p.lines),
        estimatedCost: p.totalBilled,
        clinicalNotes: notes.value,
        idempotencyKey: input.idempotencyKey,
      },
      {
        adjudicate: async (preauthId, tid) => {
          await preauthAdjudicationService.executeAutoDecision(preauthId, tid, await getSystemActorId(tid));
        },
      },
      undefined,
      { procedureProvenance: procedureProvenance(p.lines) },
    );
  } catch (err) {
    if (err instanceof PreauthIntakeConflict) {
      return mutationFail("CONFLICT", {
        correlationId: p.correlationId,
        message: "These details differ from an earlier submission made from this form, so nothing new was saved. Submit again to send them as a new request.",
      });
    }
    // Anything else may have happened before or after the request was stored.
    return mutationFail("UNKNOWN_OUTCOME", {
      correlationId: p.correlationId,
      message: "We could not confirm whether the pre-authorisation was received. Check your pre-authorisations before submitting again.",
    });
  }

  if (result.status === "REJECTED" || !result.preauthId) return preauthRefusal(result.errors);

  const pa = await prisma.preAuthorization.findUnique({ where: { id: result.preauthId }, select: { preauthNumber: true } });
  const ref = pa?.preauthNumber ?? result.preauthId;
  revalidatePath("/provider/preauth");
  redirect(`/provider/preauth?submitted=${encodeURIComponent(ref)}${result.replayed ? "&replayed=1" : ""}`);
}
