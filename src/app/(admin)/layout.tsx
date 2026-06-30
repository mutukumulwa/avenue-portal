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

    // Global Route Guard for Admin paths
    if (!session || userRole === "HR_MANAGER" || userRole === "BROKER_USER" || userRole === "MEMBER_USER") {
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
          <AdminSidebar userRole={userRole} />
          <div className="flex-1 ml-60 p-8">
            <Breadcrumbs />
            {children}
          </div>
        </div>
      </TermProvider>
    );
  });
}
