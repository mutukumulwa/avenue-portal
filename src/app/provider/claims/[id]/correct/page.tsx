import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerCanCorrect } from "@/server/services/claim-replacement/policy";
import { prisma } from "@/lib/prisma";
import type { ClaimLineCategory } from "@prisma/client";
import { CorrectClaimForm, type CorrectionPrefill } from "./CorrectClaimForm";

export default async function ProviderCorrectClaim({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { id } = await params;

  // Hard provider scope: a facility can only ever correct its own claim.
  const claim = await prisma.claim.findFirst({
    where: { id, tenantId: ctx.tenantId, providerId: ctx.providerId },
    select: {
      id: true, claimNumber: true, status: true, providerBranchId: true, supersededByClaimId: true,
      decidedAt: true, paidAt: true, paymentVoucherId: true, settlementBatchId: true,
      serviceType: true, benefitCategory: true, dateOfService: true, attendingDoctor: true,
      billedAmount: true, currency: true, diagnoses: true,
      member: { select: { memberNumber: true, firstName: true, lastName: true } },
      providerBranch: { select: { name: true } },
      claimLines: {
        select: { serviceCategory: true, description: true, cptCode: true, quantity: true, unitCost: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!claim) notFound();

  // Server-computed allowed action — an un-correctable claim never reaches the form.
  if (!providerCanCorrect(ctx, claim)) redirect(`/provider/claims/${claim.id}`);

  const diagnoses = (claim.diagnoses as unknown as Array<{ code?: string; icdCode?: string; isPrimary?: boolean }>) ?? [];
  const primary = diagnoses.find((d) => d.isPrimary) ?? diagnoses[0];

  const prefill: CorrectionPrefill = {
    memberNumber: claim.member.memberNumber,
    memberName: `${claim.member.firstName} ${claim.member.lastName}`,
    branchName: claim.providerBranch?.name ?? null,
    serviceType: claim.serviceType,
    benefitCategory: claim.benefitCategory,
    dateOfService: new Date(claim.dateOfService).toISOString().slice(0, 10),
    attendingDoctor: claim.attendingDoctor ?? "",
    primaryDiagnosisCode: primary?.icdCode ?? primary?.code ?? "",
    originalBilled: Number(claim.billedAmount),
    currency: claim.currency,
    lines: claim.claimLines.map((l) => ({
      serviceCategory: l.serviceCategory as ClaimLineCategory,
      description: l.description,
      cptCode: l.cptCode ?? "",
      quantity: l.quantity,
      unitCost: Number(l.unitCost),
    })),
  };

  const [icd, cpt] = await Promise.all([
    prisma.iCD10Code.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" }, take: 500 }),
    prisma.cPTCode.findMany({ select: { code: true, description: true, averageCost: true, serviceCategory: true }, orderBy: { code: "asc" }, take: 500 }),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/provider/claims/${claim.id}`} className="text-brand-text-muted hover:text-brand-text-heading"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Correct claim {claim.claimNumber}</h1>
          <p className="text-brand-text-muted text-sm">Prepare a full corrected claim. The original is superseded, never edited in place.</p>
        </div>
      </div>

      <CorrectClaimForm
        predecessorClaimId={claim.id}
        predecessorNumber={claim.claimNumber}
        prefill={prefill}
        icdOptions={icd.map((d) => ({ code: d.code, description: d.description }))}
        cptOptions={cpt.map((c) => ({ code: c.code, description: c.description, averageCost: Number(c.averageCost ?? 0), category: c.serviceCategory }))}
      />
    </div>
  );
}
