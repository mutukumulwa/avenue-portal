import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderCaseContextService } from "@/server/services/provider-case-context.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { operatingTodayISO } from "@/lib/service-date";
import { ProviderClaimForm } from "./ProviderClaimForm";

/**
 * Family Hospital UAT plan P04.01 — the provider "File a claim" page.
 *
 * It no longer preloads 500 ICD-10 codes and 500 CPT codes with their global
 * average costs into the page (FH-02, FH-05): diagnoses and the facility's own
 * services are searched on demand. The default service date is the Kampala
 * operating date computed here, on the server (FH-09).
 *
 * The eligibility result links here with `?from=<eligibility check id>` — an
 * opaque, expiring evidence reference, never a member number or member id
 * (plan §4 rule 5, P02.02 step 5). It is read under this user's tenant and
 * provider and then re-resolved like any other lookup; a foreign, stale or
 * malformed reference simply starts an empty form.
 */
export default async function ProviderNewClaim({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // ELIG-GAP-020: filing a claim requires provider.claim.create.
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.claim.create")) redirect("/unauthorized");
  const { from } = await searchParams;

  const today = operatingTodayISO();
  const handoff = from ? await ProviderCaseContextService.handoffFromEligibilityCheck(ctx, from) : null;
  const operational = provider.contractStatus === "ACTIVE";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/provider/claims" className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to claims">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-text-heading">File a claim</h1>
          <p className="text-sm text-brand-text-muted">Capture an encounter for adjudication by the TPA.</p>
        </div>
      </div>

      {!operational ? (
        <div className="rounded-lg border border-[#FFC107]/50 bg-[#FFF8E1] px-4 py-3 text-sm font-semibold text-[#856404]">
          This facility&apos;s contract is {provider.contractStatus} — claims can only be filed against an ACTIVE contract.
        </div>
      ) : (
        <ProviderClaimForm today={today} handoff={handoff} />
      )}
    </div>
  );
}
