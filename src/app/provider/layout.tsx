import { ProviderNav } from "@/components/layouts/ProviderNav";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { computeProviderNav, flattenProviderNav } from "@/components/layouts/provider-nav-model";

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  // F1.4: resolve the canonical access context (F1.3) server-side and render
  // navigation from the caller's permissions. Only the safe, filtered item list
  // crosses to the client — never the permissions/provider/branch context (§6.5).
  // requireProvider (inside resolveUserContext) still performs the standard
  // login/role/unauthorized redirects; each page remains independently
  // server-authorized, so hiding a nav item is convenience, not security.
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  const navItems = flattenProviderNav(computeProviderNav(ctx.permissions));

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <ProviderNav providerName={provider.name} items={navItems} />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
