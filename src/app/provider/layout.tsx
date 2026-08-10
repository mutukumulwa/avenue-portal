import { ProviderNav } from "@/components/layouts/ProviderNav";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { computeProviderNav, flattenProviderNav, resolveProviderPersonaLabel } from "@/components/layouts/provider-nav-model";
import { rbacService } from "@/server/services/rbac.service";

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  // F1.4: resolve the canonical access context (F1.3) server-side and render
  // navigation from the caller's permissions. Only the safe, filtered item list
  // crosses to the client — never the permissions/provider/branch context (§6.5).
  // requireProvider (inside resolveUserContext) still performs the standard
  // login/role/unauthorized redirects; each page remains independently
  // server-authorized, so hiding a nav item is convenience, not security.
  const { ctx, provider, session } = await ProviderAccessService.resolveUserContext();
  // F7.3: the Contracts item is gated on the same sign-off flag as its pages.
  const contractView = await ProviderAccessSettingsService.isContractViewEnabled(ctx.tenantId, ctx.providerId);
  const navItems = flattenProviderNav(computeProviderNav(ctx.permissions, { flags: { contractView } }));

  // DEF-002: resolve the signed-in user's real provider persona for the identity
  // block. In prod before the RBAC seed there are no persona rows, so this is
  // null and ProviderNav falls back to the generic "Provider" label.
  const roleCodes = await rbacService.getUserRoles(ctx.actorId, ctx.tenantId);
  const roleLabel = resolveProviderPersonaLabel(roleCodes);

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <ProviderNav providerName={provider.name} items={navItems} actorName={session.user.name ?? null} roleLabel={roleLabel} />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
