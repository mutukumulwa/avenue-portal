import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerCanCorrect } from "@/server/services/claim-replacement/policy";
import { REPLACEMENT_SEED_SELECT, replacementSeed } from "@/server/services/provider-claim-seed";
import { prisma } from "@/lib/prisma";
import { operatingTodayISO } from "@/lib/service-date";
import { CorrectClaimForm } from "./CorrectClaimForm";

/**
 * F5.8 — correct an undecided claim. Family Hospital UAT plan P04.02: the form
 * is seeded from the claim's stored data (provider-claim-seed.ts) and no global
 * CPT/ICD list is preloaded — diagnoses and services are searched on demand.
 */
export default async function ProviderCorrectClaim({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { id } = await params;

  // Hard provider scope: a facility can only ever correct its own claim.
  const claim = await prisma.claim.findFirst({
    where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId },
    select: {
      id: true, claimNumber: true, status: true, supersededByClaimId: true,
      decidedAt: true, paidAt: true, paymentVoucherId: true, settlementBatchId: true,
      ...REPLACEMENT_SEED_SELECT,
    },
  });
  if (!claim) notFound();

  // Server-computed allowed action — an un-correctable claim never reaches the form.
  if (!providerCanCorrect(ctx, claim)) redirect(`/provider/claims/${claim.id}`);

  const seed = await replacementSeed(claim);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/provider/claims/${claim.id}`} className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to claims">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Correct claim {claim.claimNumber}</h1>
          <p className="text-sm text-brand-text-muted">Prepare a full corrected claim. The original is superseded, never edited in place.</p>
        </div>
      </div>

      <CorrectClaimForm predecessorClaimId={claim.id} predecessorNumber={claim.claimNumber} today={operatingTodayISO()} seed={seed} />
    </div>
  );
}
