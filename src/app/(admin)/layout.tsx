import { getCachedSession } from "@/lib/auth";
import { AdminSidebar } from "@/components/layouts/AdminSidebar";
import { Breadcrumbs } from "@/components/layouts/Breadcrumbs";
import { TenantThemeInjector } from "@/components/layouts/TenantThemeInjector";
import { TermProvider } from "@/components/terminology/TermProvider";
import { TerminologyService } from "@/server/services/terminology.service";
import { measureAsync } from "@/lib/perf";
import type { UserRole } from "@prisma/client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return measureAsync("layout.admin", async () => {
    const session = await getCachedSession();
    const userRole = (session?.user?.role ?? null) as UserRole | null;

    // Global Route Guard for Admin paths.
    //
    // DEF-003: roles that own a non-admin portal are sent to their own portal
    // rather than /unauthorized — the admin shell scopes by tenant, which for
    // an employer-side user (FUND_ADMINISTRATOR) would mean cross-employer
    // reach. resolvePostLoginPath is the single source for "where does this
    // role live", so this guard cannot drift from the login redirect.
    if (session && userRole && userRole !== "SUPER_ADMIN") {
      const { resolvePostLoginPath } = await import("@/lib/post-login");
      const home = resolvePostLoginPath(userRole);
      if (home !== "/dashboard" && home !== "/reports") {
        const { redirect } = await import("next/navigation");
        redirect(home);
      }
    }

    if (!session) {
      const { requireRole, ROLES } = await import("@/lib/rbac");
      await requireRole(ROLES.ANY_STAFF); // will automatically redirect to auth or forbidden
    }

    // Terminology map for the current client context (G2.4). Client components
    // read it via useTerm(); empty when no dictionary is configured.
    const termMap = session?.user?.tenantId
      ? await TerminologyService.getMap(session.user.tenantId, session.user.clientId)
      : {};

    return (
      <TermProvider value={termMap}>
        {session?.user?.tenantId && (
          <TenantThemeInjector tenantId={session.user.tenantId} />
        )}
        <div className="flex min-h-screen bg-brand-bg-alt/30">
          <AdminSidebar userRole={userRole} userName={session?.user?.name ?? null} />
          <div className="flex-1 ml-60 p-8">
            <Breadcrumbs />
            {children}
          </div>
        </div>
      </TermProvider>
    );
  });
}
