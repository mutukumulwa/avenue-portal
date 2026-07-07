import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProvider } from "@/lib/provider-portal";
import { prisma } from "@/lib/prisma";
import { ProviderClaimForm } from "./ProviderClaimForm";

export default async function ProviderNewClaim({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { provider, tenantId } = await requireProvider();
  const { memberId } = await searchParams;

  const [icd, cpt, prefill] = await Promise.all([
    prisma.iCD10Code.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" }, take: 500 }),
    prisma.cPTCode.findMany({ select: { code: true, description: true, averageCost: true, serviceCategory: true }, orderBy: { code: "asc" }, take: 500 }),
    memberId
      ? prisma.member.findFirst({ where: { id: memberId, tenantId }, select: { memberNumber: true, firstName: true, lastName: true } })
      : null,
  ]);

  const operational = provider.contractStatus === "ACTIVE";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/claims" className="text-brand-text-muted hover:text-brand-text-heading"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">File a claim</h1>
          <p className="text-brand-text-muted text-sm">Capture an outpatient encounter for adjudication by the TPA.</p>
        </div>
      </div>

      {!operational ? (
        <div className="rounded-lg bg-[#FFF8E1] border border-[#FFC107]/50 px-4 py-3 text-sm font-semibold text-[#856404]">
          This facility&apos;s contract is {provider.contractStatus} — claims can only be filed against an ACTIVE contract.
        </div>
      ) : (
        <ProviderClaimForm
          icdOptions={icd.map((d) => ({ code: d.code, description: d.description }))}
          cptOptions={cpt.map((c) => ({ code: c.code, description: c.description, averageCost: Number(c.averageCost ?? 0), category: c.serviceCategory }))}
          prefillMemberNumber={prefill?.memberNumber ?? ""}
          prefillMemberName={prefill ? `${prefill.firstName} ${prefill.lastName}` : ""}
        />
      )}
    </div>
  );
}
