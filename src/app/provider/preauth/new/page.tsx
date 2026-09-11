import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { operatingTodayISO } from "@/lib/service-date";
import { ProviderPreauthForm } from "./ProviderPreauthForm";

/**
 * Family Hospital UAT plan P04.03 — the provider "Request pre-authorisation"
 * page. It no longer preloads 500 ICD-10 and 500 CPT codes with their global
 * average costs (FH-02, FH-05); the default expected date is the Kampala
 * operating date computed here, on the server.
 */
export default async function ProviderNewPreauth() {
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) redirect("/unauthorized");

  const operational = provider.contractStatus === "ACTIVE";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/provider/preauth" className="text-brand-text-muted hover:text-brand-text-heading" aria-label="Back to pre-authorisations">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Request pre-authorisation</h1>
          <p className="text-sm text-brand-text-muted">Submit a pre-authorisation request for review by the TPA.</p>
        </div>
      </div>

      {!operational ? (
        <div className="rounded-lg border border-[#FFC107]/50 bg-[#FFF8E1] px-4 py-3 text-sm font-semibold text-[#856404]">
          This facility&apos;s contract is {provider.contractStatus} — pre-authorisations can only be requested against an ACTIVE contract.
        </div>
      ) : (
        <ProviderPreauthForm today={operatingTodayISO()} />
      )}
    </div>
  );
}
