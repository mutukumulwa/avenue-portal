import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ClaimResubmissionEligibilityService } from "@/server/services/claim-resubmission/eligibility.service";
import { REPLACEMENT_SEED_SELECT, replacementSeed } from "@/server/services/provider-claim-seed";
import { prisma } from "@/lib/prisma";
import { operatingTodayISO } from "@/lib/service-date";
import { CorrectClaimForm } from "../correct/CorrectClaimForm";
import { resubmitProviderClaimAction } from "./actions";

/**
 * F5.10 — resubmit a declined claim. Family Hospital UAT plan P04.02: seeded
 * from the claim's stored data; no global CPT/ICD preload.
 */
export default async function ProviderResubmitClaim({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { id } = await params;

  // Hard provider scope: a facility can only ever resubmit its own claim.
  const claim = await prisma.claim.findFirst({
    where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId },
    select: { id: true, claimNumber: true, ...REPLACEMENT_SEED_SELECT },
  });
  if (!claim) notFound();

  // Server-computed eligibility (F5.9) — an ineligible declined claim never reaches the form.
  const eligibility = await ClaimResubmissionEligibilityService.check(ctx, claim.id);
  if (!eligibility.eligible) redirect(`/provider/claims/${claim.id}`);

  const seed = await replacementSeed(claim);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/provider/claims/${claim.id}`} className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to claims">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Resubmit claim {claim.claimNumber}</h1>
          <p className="text-sm text-brand-text-muted">{eligibility.reason} The original decline is kept, never edited in place.</p>
        </div>
      </div>

      <CorrectClaimForm
        mode="resubmit"
        submitAction={resubmitProviderClaimAction}
        predecessorClaimId={claim.id}
        predecessorNumber={claim.claimNumber}
        today={operatingTodayISO()}
        seed={seed}
      />
    </div>
  );
}
