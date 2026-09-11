"use server";

/**
 * Family Hospital UAT plan P04.01 — the provider "File a claim" action.
 *
 * A Server Action is a public POST endpoint (vendored Next 15.5.15 guide,
 * 01-app/02-guides/data-security.mdx), so this action trusts nothing it is
 * sent. Tenant, provider, actor, permissions and branches come from the
 * session; the case (member, eligibility, contract, currency), the diagnosis
 * and every line are rebuilt on the server by `ProviderClaimCaptureService`
 * — a tariff id is the only pricing input accepted, and the contracted rate is
 * re-read from that row (P02.04). The claim then goes through the one
 * canonical intake (`runClaimIntake`), with the case currency and the
 * server-built capture provenance.
 *
 * Outcomes are a `MutationFailure` the form renders (field errors focus-managed)
 * or a redirect to the claims list with the claim number. `redirect()` throws,
 * so it is called outside every try/catch (vendored redirecting.mdx).
 *
 * `"use server"`: async function exports only (AGENTS.md); the input type lives
 * in src/lib/provider-capture-contract.ts.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import type { ClaimCaptureSubmission } from "@/lib/provider-capture-contract";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { isProviderAccessError, ProviderAccessService } from "@/server/services/provider-access.service";
import { runClaimIntake } from "@/server/services/claim-intake";
import { intakeFailure, ProviderClaimCaptureService } from "@/server/services/provider-claim-capture.service";

export async function submitProviderClaimAction(input: ClaimCaptureSubmission): Promise<MutationFailure | void> {
  // ELIG-GAP-020: the permission is checked before any member resolution or
  // intake side effect.
  let access;
  try {
    access = await ProviderAccessService.resolveUserContext();
  } catch (err) {
    if (isProviderAccessError(err)) return mutationFail("FORBIDDEN", { message: "You do not have permission to submit claims." });
    throw err; // includes the framework's redirect to sign-in
  }
  const { ctx, session } = access;
  if (!providerPermits(ctx.permissions, "provider.claim.create")) {
    return mutationFail("FORBIDDEN", { message: "You do not have permission to submit claims." });
  }

  const prep = await ProviderClaimCaptureService.prepare(ctx, input, { purpose: "CLAIM" });
  if (!prep.ok) return prep.failure;
  const p = prep.prepared;

  // BD-02 / OBS-5: soft-block an identical claim (same facility, member, date
  // and total) captured in the last 2 minutes — a re-submit after a lost
  // response — and name the claim that already exists. A genuine second
  // encounter later in the day is not blocked; adjudication-time double-capture
  // routing still applies beyond this window. Compared as a decimal.
  const recentDuplicate = await prisma.claim.findFirst({
    where: {
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
      memberId: p.trusted.memberId,
      dateOfService: p.trusted.serviceDate,
      billedAmount: new Prisma.Decimal(p.totalBilled),
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { claimNumber: true },
    orderBy: { createdAt: "desc" },
  });
  if (recentDuplicate) {
    return mutationFail("CONFLICT", {
      correlationId: p.correlationId,
      message:
        `An identical claim (${recentDuplicate.claimNumber}) for this member, date and amount was just submitted from this facility. ` +
        `It is already in the queue — refresh your claims list rather than submitting again. If this is a genuine second encounter, adjust a line and resubmit.`,
    });
  }

  const result = await runClaimIntake(
    // The facility is the session's (D12) — a facility can never file for another.
    { kind: "providerUser", tenantId: ctx.tenantId, userId: session.user.id, providerId: ctx.providerId },
    {
      memberId: p.trusted.memberId,
      providerId: ctx.providerId,
      providerBranchId: p.trusted.branchId,
      serviceType: p.serviceType,
      benefitCategory: p.trusted.benefitCategory,
      dateOfService: p.trusted.serviceDateIso,
      attendingDoctor: p.attendingDoctor,
      diagnoses: [{ code: p.diagnosis.code, description: p.diagnosis.description, standardCharge: null, isPrimary: true }],
      lineItems: ProviderClaimCaptureService.intakeLines(p),
      ...(p.trusted.currency ? { currency: p.trusted.currency } : {}),
    },
    { idempotencyKey: input.idempotencyKey, origin: { lineProvenance: ProviderClaimCaptureService.lineProvenance(p) } },
  );
  if (!result.ok) return intakeFailure(result.code, result.error);

  // A replay of a receipt that never produced a claim is not a filed claim.
  if (!result.claimId || !result.claimNumber) {
    return result.receiptState === "PROCESSING"
      ? mutationFail("UNKNOWN_OUTCOME", {
          message: "This claim is still being received. Check your claims list in a minute before submitting again.",
        })
      : mutationFail("VALIDATION", { message: "This claim was not accepted, and nothing was saved. Check the details and submit again." });
  }

  revalidatePath("/provider/claims");
  revalidatePath("/provider/dashboard");
  redirect(`/provider/claims?submitted=${encodeURIComponent(result.claimNumber)}${result.replayed ? "&replayed=1" : ""}`);
}
