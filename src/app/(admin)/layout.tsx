import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/layouts/AdminSidebar";
import { Breadcrumbs } from "@/components/layouts/Breadcrumbs";
import { TenantThemeInjector } from "@/components/layouts/TenantThemeInjector";
import type { UserRole } from "@prisma/client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userRole = (session?.user?.role ?? null) as UserRole | null;

  // Global Route Guard for Admin paths
  if (!session || userRole === "HR_MANAGER") {
    const { requireRole, ROLES } = await import("@/lib/rbac");
    await requireRole(ROLES.ANY_STAFF); // will automatically redirect to auth or forbidden
  }

  return (
    <>
      {session?.user?.tenantId && (
        <TenantThemeInjector tenantId={session.user.tenantId} />
      )}
      <div className="flex min-h-screen bg-avenue-bg-alt/30">
        <AdminSidebar userRole={userRole} />
        <div className="flex-1 ml-60 p-8">
          <Breadcrumbs />
          {children}
        </div>
      </div>
    </>
  );
}
