import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderPreauthForm } from "./ProviderPreauthForm";

export default async function ProviderNewPreauth({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) redirect("/unauthorized");
  const { memberId } = await searchParams;

  const [icd, cpt, prefill] = await Promise.all([
    prisma.iCD10Code.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" }, take: 500 }),
    prisma.cPTCode.findMany({ select: { code: true, description: true, averageCost: true }, orderBy: { code: "asc" }, take: 500 }),
    // ELIG-GAP-024: entitlement-scope the prefill so a foreign/uncovered memberId resolves to null.
    memberId ? prisma.member.findFirst({ where: { id: memberId, tenantId: ctx.tenantId, ...(await ProviderEntitlementService.entitledMemberWhere(ctx.providerId)) }, select: { memberNumber: true } }) : null,
  ]);

  const operational = provider.contractStatus === "ACTIVE";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/preauth" className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to pre-authorisations"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Request pre-authorization</h1>
          <p className="text-brand-text-muted text-sm">Submit a pre-authorization request for review by the TPA.</p>
        </div>
      </div>

      {!operational ? (
        <div className="rounded-lg bg-[#FFF8E1] border border-[#FFC107]/50 px-4 py-3 text-sm font-semibold text-[#856404]">
          This facility&apos;s contract is {provider.contractStatus} — pre-authorizations can only be requested against an ACTIVE contract.
        </div>
      ) : (
        <ProviderPreauthForm
          icdOptions={icd.map((d) => ({ code: d.code, description: d.description }))}
          cptOptions={cpt.map((c) => ({ code: c.code, description: c.description, averageCost: Number(c.averageCost ?? 0) }))}
          prefillMemberNumber={prefill?.memberNumber ?? ""}
        />
      )}
    </div>
  );
}
