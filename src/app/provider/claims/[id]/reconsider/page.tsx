import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ClaimReconsiderationService } from "@/server/services/claim-reconsideration/submit.service";
import { reconsiderationReasonsFor } from "@/server/services/claim-reconsideration/policy";
import { prisma } from "@/lib/prisma";
import { ReconsiderClaimForm, type ReconsiderLineView } from "./ReconsiderClaimForm";

export default async function ProviderReconsiderClaim({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { id } = await params;

  // Hard provider scope: a facility can only ever reconsider its own claim.
  const claim = await prisma.claim.findFirst({
    where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId },
    select: {
      id: true, claimNumber: true, status: true, currency: true,
      claimLines: {
        select: { id: true, description: true, cptCode: true, billedAmount: true, approvedAmount: true, payerLiability: true, disallowedAmount: true, declineReason: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!claim) notFound();

  // Server-computed eligibility (F5.12) — an ineligible claim never reaches the form.
  const eligibility = await ClaimReconsiderationService.checkEligibility(ctx, claim.id);
  if (!eligibility.eligible) redirect(`/provider/claims/${claim.id}`);

  const lines: ReconsiderLineView[] = claim.claimLines.map((l) => ({
    id: l.id,
    description: l.description,
    cptCode: l.cptCode,
    billed: Number(l.billedAmount),
    allowed: Number(l.approvedAmount),
    payable: Number(l.payerLiability),
    disallowed: Number(l.disallowedAmount),
    safeReason: l.declineReason,
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/provider/claims/${claim.id}`} className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to claims"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Reconsider claim {claim.claimNumber}</h1>
          <p className="text-brand-text-muted text-sm">{eligibility.reason} The original decision and payment stay as recorded.</p>
        </div>
      </div>

      <ReconsiderClaimForm
        claimId={claim.id}
        claimNumber={claim.claimNumber}
        currency={claim.currency}
        filingDeadline={eligibility.deadline?.toISOString() ?? null}
        lines={lines}
        reasons={reconsiderationReasonsFor(claim.status)}
      />
    </div>
  );
}
