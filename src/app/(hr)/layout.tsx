import { auth } from "@/lib/auth";
import { HRSidebar } from "@/components/layouts/HRSidebar";
import { Breadcrumbs } from "@/components/layouts/Breadcrumbs";
import { TenantThemeInjector } from "@/components/layouts/TenantThemeInjector";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function HRLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = session?.user?.role;
  const allowed = ["HR_MANAGER", "SUPER_ADMIN"];
  if (!session?.user || !allowed.includes(role as string)) {
    redirect("/login");
  }

  // For SUPER_ADMIN visiting the HR portal, show a generic label
  const groupId = session.user.groupId;
  let groupName = role === "SUPER_ADMIN" ? "HR Portal (Admin view)" : "Manage Group";
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true }
    });
    if (group) groupName = group.name;
  }

  return (
    <>
      {session.user.tenantId && (
        <TenantThemeInjector tenantId={session.user.tenantId} />
      )}
      <div className="flex min-h-screen bg-avenue-bg-alt/30">
        <HRSidebar groupName={groupName} userRole={session.user.role as string} />
        <div className="flex-1 ml-60 p-8">
          <Breadcrumbs />
          {children}
        </div>
      </div>
    </>
  );
}
