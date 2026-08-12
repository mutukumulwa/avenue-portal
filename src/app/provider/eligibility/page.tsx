import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { EligibilityCheckForm } from "./EligibilityCheckForm";

/**
 * F1.11: eligibility runs through the canonical ProviderEligibilityService
 * (entitlement-scoped, PRIVACY-S1-A).
 *
 * UAT-HF P03.05 restructured this page. It used to be a `<form method="GET">`
 * whose result was rendered from `searchParams`, which put every member number
 * anyone typed into the URL — and so into the browser history of a shared front
 * desk machine, the server access log, and the `Referer` of every link on the
 * page (DEF-079). The lookup now posts through a Server Action.
 *
 * Input safety (ELIG-GAP-007/008/010/011/012) moved to `actions.ts` with it —
 * it has to be server-side regardless, because an action can be invoked
 * directly, whatever the form allows.
 *
 * The RBAC gate stays here so an unauthorised user is redirected before any of
 * the form renders, rather than being told "no permission" after submitting.
 */
export default async function ProviderEligibility() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  // ELIG-GAP-020 / Phase 2: require the eligibility read permission (fail-closed).
  if (!providerPermits(ctx.permissions, "provider.eligibility.read")) redirect("/unauthorized");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-brand-text-heading">
          <UserCheck size={22} /> Member eligibility
        </h1>
        <p className="mt-1 text-sm text-brand-text-muted">
          Enter the member/card number to confirm cover before treating.
        </p>
      </div>

      <EligibilityCheckForm />
    </div>
  );
}
